import { describe, expect, it } from "vitest";
import {
  buildAnimationPreviewModel,
  buildFrameRows,
  resolveSheetUrls,
  summarizeMetadata
} from "../public/resultPresenter.js";

describe("result presenter", () => {
  it("summarizes export metadata for the result panel", () => {
    expect(
      summarizeMetadata({
        frameCount: 15,
        fps: 15,
        frameWidth: 128,
        frameHeight: 96,
        padding: 2,
        extrude: 1
      })
    ).toBe("15 frames · 15 fps · 128x96 · padding 2px · extrude 1px");
  });

  it("resolves sheet preview urls from the API result", () => {
    expect(
      resolveSheetUrls({
        sheetUrls: [{ file: "sprite-sheet-001.png", url: "/exports/job-1/sprite-sheet-001.png" }],
        metadata: { sheets: [{ file: "sprite-sheet-001.png" }] }
      })
    ).toEqual([{ file: "sprite-sheet-001.png", url: "/exports/job-1/sprite-sheet-001.png" }]);
  });

  it("can fall back to metadata sheets when only a job id is available", () => {
    expect(
      resolveSheetUrls(
        {
          metadata: {
            sheets: [{ file: "sprite-sheet-001.png" }, { file: "sprite-sheet-002.png" }]
          }
        },
        "job-2"
      )
    ).toEqual([
      { file: "sprite-sheet-001.png", url: "/exports/job-2/sprite-sheet-001.png" },
      { file: "sprite-sheet-002.png", url: "/exports/job-2/sprite-sheet-002.png" }
    ]);
  });

  it("builds Godot coordinate rows from frame metadata", () => {
    expect(
      buildFrameRows({
        frames: [
          {
            index: 0,
            sheet: "sprite-sheet-001.png",
            frameRect: { x: 1, y: 1, width: 128, height: 96 },
            cellRect: { x: 0, y: 0, width: 130, height: 98 }
          }
        ]
      })
    ).toEqual([
      {
        index: 0,
        sheet: "sprite-sheet-001.png",
        frameRect: "x:1 y:1 w:128 h:96",
        cellRect: "x:0 y:0 w:130 h:98"
      }
    ]);
  });

  it("builds an animation preview model from frame metadata and sheet urls", () => {
    expect(
      buildAnimationPreviewModel(
        {
          sheetUrls: [
            { file: "sprite-sheet-001.png", url: "/exports/job-1/sprite-sheet-001.png" },
            { file: "sprite-sheet-002.png", url: "/exports/job-1/sprite-sheet-002.png" }
          ],
          metadata: {
            fps: 15,
            frameWidth: 128,
            frameHeight: 96,
            frames: [
              {
                index: 1,
                sheet: "sprite-sheet-002.png",
                frameRect: { x: 5, y: 6, width: 128, height: 96 }
              },
              {
                index: 0,
                sheet: "sprite-sheet-001.png",
                frameRect: { x: 1, y: 2, width: 128, height: 96 }
              }
            ]
          }
        },
        "job-1"
      )
    ).toEqual({
      fps: 15,
      frameDurationMs: 1000 / 15,
      width: 128,
      height: 96,
      frames: [
        {
          index: 0,
          sheet: "sprite-sheet-001.png",
          imageUrl: "/exports/job-1/sprite-sheet-001.png",
          sourceRect: { x: 1, y: 2, width: 128, height: 96 }
        },
        {
          index: 1,
          sheet: "sprite-sheet-002.png",
          imageUrl: "/exports/job-1/sprite-sheet-002.png",
          sourceRect: { x: 5, y: 6, width: 128, height: 96 }
        }
      ]
    });
  });
});
