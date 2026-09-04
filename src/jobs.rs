use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{config::Config, media::VideoMetadata, sprite_sheet::SpriteMetadata};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Uploaded,
    Exporting,
    Done,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SheetUrl {
    pub file: String,
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub metadata: SpriteMetadata,
    pub sheet_urls: Vec<SheetUrl>,
    pub download_url: String,
}

#[derive(Clone, Debug)]
pub struct Job {
    pub id: Uuid,
    pub input_path: PathBuf,
    pub original_name: String,
    pub sample_dir: PathBuf,
    pub frames_dir: PathBuf,
    pub output_dir: PathBuf,
    pub status: JobStatus,
    pub progress: u8,
    pub result: Option<ExportResult>,
    pub error: Option<String>,
    pub video_metadata: Option<VideoMetadata>,
}

impl Job {
    pub fn new(config: &Config, id: Uuid, original_name: String) -> Self {
        let job_dir = config.workspace_dir.join(id.to_string());
        Self {
            id,
            input_path: job_dir.join("input"),
            original_name,
            sample_dir: job_dir.join("samples"),
            frames_dir: job_dir.join("frames"),
            output_dir: config.export_dir.join(id.to_string()),
            status: JobStatus::Uploaded,
            progress: 0,
            result: None,
            error: None,
            video_metadata: None,
        }
    }

    pub fn public(&self) -> PublicJob {
        PublicJob {
            id: self.id,
            original_name: self.original_name.clone(),
            status: self.status,
            progress: self.progress,
            result: self.result.clone(),
            error: self.error.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicJob {
    pub id: Uuid,
    pub original_name: String,
    pub status: JobStatus,
    pub progress: u8,
    pub result: Option<ExportResult>,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct JobStore {
    jobs: RwLock<HashMap<Uuid, Job>>,
}

impl JobStore {
    pub async fn insert(&self, job: Job) {
        self.jobs.write().await.insert(job.id, job);
    }

    pub async fn get(&self, id: Uuid) -> Option<Job> {
        self.jobs.read().await.get(&id).cloned()
    }

    pub async fn begin_export(&self, id: Uuid) -> Option<Job> {
        let mut jobs = self.jobs.write().await;
        if jobs.values().any(|job| job.status == JobStatus::Exporting) {
            return None;
        }

        let job = jobs.get_mut(&id)?;
        job.status = JobStatus::Exporting;
        job.progress = 10;
        job.result = None;
        job.error = None;
        Some(job.clone())
    }

    pub async fn update<F>(&self, id: Uuid, update: F) -> Option<Job>
    where
        F: FnOnce(&mut Job),
    {
        let mut jobs = self.jobs.write().await;
        let job = jobs.get_mut(&id)?;
        update(job);
        Some(job.clone())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[tokio::test]
    async fn serializes_exports_across_jobs() {
        let temp = tempdir().unwrap();
        let config = Config::for_root(temp.path()).unwrap();
        let store = JobStore::default();
        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();

        store
            .insert(Job::new(&config, first_id, "first.mp4".to_owned()))
            .await;
        store
            .insert(Job::new(&config, second_id, "second.mp4".to_owned()))
            .await;

        assert!(store.begin_export(first_id).await.is_some());
        assert!(store.begin_export(second_id).await.is_none());

        store
            .update(first_id, |job| job.status = JobStatus::Done)
            .await;
        assert!(store.begin_export(second_id).await.is_some());
    }
}
