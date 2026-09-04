use std::{
    env,
    path::{Path, PathBuf},
};

use anyhow::Context;

pub const MAX_UPLOAD_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Defaults {
    pub fps: f64,
    pub tolerance: f64,
    pub feather: f64,
    pub despill: f64,
    pub scale: f64,
    pub max_sheet_width: u32,
    pub max_sheet_height: u32,
    pub padding: u32,
    pub extrude: u32,
}

impl Default for Defaults {
    fn default() -> Self {
        Self {
            fps: 12.0,
            tolerance: 42.0,
            feather: 8.0,
            despill: 25.0,
            scale: 1.0,
            max_sheet_width: 4096,
            max_sheet_height: 4096,
            padding: 2,
            extrude: 1,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub root_dir: PathBuf,
    pub public_dir: PathBuf,
    pub workspace_dir: PathBuf,
    pub export_dir: PathBuf,
    pub port: u16,
    pub defaults: Defaults,
}

impl Config {
    pub fn discover() -> anyhow::Result<Self> {
        let root_dir = match env::var_os("BG_REMOVER_ROOT") {
            Some(value) => PathBuf::from(value),
            None => env::current_dir().context("failed to resolve current working directory")?,
        };
        Self::for_root(root_dir)
    }

    pub fn for_root(root_dir: impl AsRef<Path>) -> anyhow::Result<Self> {
        let root_dir = root_dir
            .as_ref()
            .canonicalize()
            .unwrap_or_else(|_| root_dir.as_ref().to_path_buf());

        let port = env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(5177);

        Ok(Self {
            public_dir: root_dir.join("public"),
            workspace_dir: root_dir.join(".work"),
            export_dir: root_dir.join(".work").join("exports"),
            root_dir,
            port,
            defaults: Defaults::default(),
        })
    }
}
