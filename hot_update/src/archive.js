const fs = require('fs');
const path = require('path');
const tar = require('tar');
const { HttpError } = require('./errors');

function normalizeArchiveEntry(rawPath) {
  const normalizedInput = rawPath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalizedInput || normalizedInput === '.') {
    return '';
  }

  if (normalizedInput.startsWith('/')) {
    throw new HttpError(400, 'archive contains absolute path');
  }

  const normalized = path.posix.normalize(normalizedInput);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new HttpError(400, 'archive contains path traversal entry');
  }

  return normalized;
}

function assertAllowedEntryType(entry, archiveLabel) {
  if (!['File', 'Directory'].includes(entry.type)) {
    throw new HttpError(400, `${archiveLabel} contains unsupported tar entry type`);
  }
}

async function inspectTarFile(archivePath, options = {}) {
  const entries = [];
  const entryPaths = new Set();
  let totalBytes = 0;
  let failure = null;

  await tar.t({
    file: archivePath,
    strict: true,
    onentry(entry) {
      try {
        assertAllowedEntryType(entry, options.label || 'archive');
        const normalizedPath = normalizeArchiveEntry(entry.path);

        if (!normalizedPath) {
          return;
        }

        if (entryPaths.has(normalizedPath)) {
          throw new HttpError(400, `${options.label || 'archive'} contains duplicate entries`);
        }

        entryPaths.add(normalizedPath);
        totalBytes += entry.size || 0;
        entries.push({
          path: normalizedPath,
          type: entry.type,
          size: entry.size || 0,
        });
      } catch (error) {
        failure = error;
      } finally {
        entry.resume();
      }
    },
  });

  if (failure) {
    throw failure;
  }

  if (options.maxEntries && entries.length > options.maxEntries) {
    throw new HttpError(400, `${options.label || 'archive'} contains too many entries`);
  }

  if (options.maxExpandedBytes && totalBytes > options.maxExpandedBytes) {
    throw new HttpError(400, `${options.label || 'archive'} exceeds expanded size limit`);
  }

  return {
    entries,
    totalBytes,
  };
}

async function extractTarFile(archivePath, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });

  await tar.x({
    file: archivePath,
    cwd: destinationDir,
    strict: true,
    noMtime: true,
    preserveOwner: false,
  });
}

function assertArchiveEntriesContain(inspectedArchive, expectedEntries, label) {
  const present = new Set(inspectedArchive.entries.map((entry) => entry.path));
  for (const expected of expectedEntries) {
    const exists = present.has(expected)
      || inspectedArchive.entries.some((entry) => entry.path.startsWith(`${expected}/`));

    if (!exists) {
      throw new HttpError(400, `${label} missing required path: ${expected}`);
    }
  }
}

function assertExtractedEntries(extractedDir, expectedEntries, label) {
  for (const expected of expectedEntries) {
    const absolutePath = path.join(extractedDir, expected.path);
    if (!fs.existsSync(absolutePath)) {
      throw new HttpError(400, `${label} missing extracted path: ${expected.path}`);
    }

    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new HttpError(400, `${label} contains symbolic link after extraction`);
    }

    if (expected.type === 'file' && !stat.isFile()) {
      throw new HttpError(400, `${label} expected file: ${expected.path}`);
    }

    if (expected.type === 'directory' && !stat.isDirectory()) {
      throw new HttpError(400, `${label} expected directory: ${expected.path}`);
    }
  }
}

module.exports = {
  assertArchiveEntriesContain,
  assertExtractedEntries,
  extractTarFile,
  inspectTarFile,
};
