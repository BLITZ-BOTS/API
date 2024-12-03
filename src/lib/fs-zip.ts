import { nanoid } from "nanoid";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import unzipper from "unzipper";

export async function zipToFolder(zipFile: File) {
  const tempDir = join(tmpdir(), `plugin-${nanoid()}`);
  await mkdir(tempDir, { recursive: true });

  const zipPath = join(tempDir, "blitz-dev-plugin.zip");
  const fileBuffer = await zipFile.arrayBuffer();
  await writeFile(zipPath, new Uint8Array(fileBuffer));

  await createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: tempDir }))
    .promise();

  return tempDir;
}

export async function readDirRecursive(dir: string) {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
