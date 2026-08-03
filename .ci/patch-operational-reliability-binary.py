from pathlib import Path

SOURCE = Path("scripts/operational-reliability.mjs")
FIXTURE = Path("scripts/operational-reliability-fixtures.mjs")

source = SOURCE.read_text(encoding="utf-8")n
binary_before = '''  const binaryPaths = numstat.stdout.split(/\\r?\\n/).filter(Boolean).filter((line) => line.startsWith("-\\t-\\t")).map((line) => line.split("\\t").slice(2).join("\\t"));
  if (binaryPaths.length) throw new Error(`forward recovery contains binary paths unsupported by the text patch transport: ${binaryPaths.join(", ")}`);'''
binary_after = '''  const binaryPaths = numstat.stdout.split(/\\r?\\n/).filter(Boolean).filter((line) => line.startsWith("-\\t-\\t")).map((line) => line.split("\\t").slice(2).join("\\t")).sort();'''
if source.count(binary_before) != 1:
    raise SystemExit(f"expected one binary refusal block, found {source.count(binary_before)}")
source = source.replace(binary_before, binary_after)

validation_anchor = '''  requireHash(receipt.forward_recovery?.target_manifest_sha256, "repository-restore target manifest sha256");
  if (receipt.forward_recovery?.exact_tracked_tree_match !== true) throw new Error("repository-restore exact tree proof is missing");'''
validation_replacement = '''  requireHash(receipt.forward_recovery?.target_manifest_sha256, "repository-restore target manifest sha256");
  const binaryPaths = receipt.forward_recovery?.binary_paths ?? [];
  if (!Array.isArray(binaryPaths) || binaryPaths.some((row) => typeof row !== "string" || !row)) {
    throw new Error("repository-restore binary path custody is invalid");
  }
  if (new Set(binaryPaths).size !== binaryPaths.length || JSON.stringify(binaryPaths) !== JSON.stringify([...binaryPaths].sort())) {
    throw new Error("repository-restore binary paths must be unique and sorted");
  }
  if (binaryPaths.some((row) => !receipt.forward_recovery?.changed_paths?.includes(row))) {
    throw new Error("repository-restore binary path is absent from changed-path custody");
  }
  if (binaryPaths.length && receipt.forward_recovery?.binary_patch_transport !== true) {
    throw new Error("repository-restore binary patch transport is not certified");
  }
  if (receipt.forward_recovery?.exact_tracked_tree_match !== true) throw new Error("repository-restore exact tree proof is missing");'''
if source.count(validation_anchor) != 1:
    raise SystemExit(f"expected one restore validation anchor, found {source.count(validation_anchor)}")
source = source.replace(validation_anchor, validation_replacement)

receipt_anchor = '''      changed_paths: changedPaths,
      target_files: targetTree.files,'''
receipt_replacement = '''      changed_paths: changedPaths,
      binary_paths: binaryPaths,
      binary_patch_transport: true,
      target_files: targetTree.files,'''
if source.count(receipt_anchor) != 1:
    raise SystemExit(f"expected one forward-recovery receipt anchor, found {source.count(receipt_anchor)}")
source = source.replace(receipt_anchor, receipt_replacement)

if "unsupported by the text patch transport" in source:
    raise SystemExit("binary refusal survived source repair")
if source.count("binary_patch_transport") != 2:
    raise SystemExit("binary patch transport custody was not added exactly twice")
SOURCE.write_text(source, encoding="utf-8")

fixture = FIXTURE.read_text(encoding="utf-8")
import_anchor = '''  runPublicationRollbackDrill,
  selectPublicationPaths,'''
import_replacement = '''  runPublicationRollbackDrill,
  runRepositoryRestoreDrill,
  selectPublicationPaths,'''
if fixture.count(import_anchor) != 1:
    raise SystemExit(f"expected one fixture import anchor, found {fixture.count(import_anchor)}")
fixture = fixture.replace(import_anchor, import_replacement)

command_anchor = '''function command(name, args, cwd) {
  const result = spawnSync(name, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
}'''
command_replacement = '''function command(name, args, cwd) {
  const result = spawnSync(name, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result;
}'''
if fixture.count(command_anchor) != 1:
    raise SystemExit(f"expected one fixture command helper, found {fixture.count(command_anchor)}")
fixture = fixture.replace(command_anchor, command_replacement)

fixture_anchor = '''  console.log("PASS — operational restore and rollback evidence contracts, tamper refusal, exact-byte recovery, and review boundary");'''
fixture_replacement = '''  const binaryCheckout = path.join(work, "binary-checkout");
  const binarySnapshotSource = path.join(work, "binary-snapshot-source");
  await mkdir(path.join(binaryCheckout, "data"), { recursive: true });
  await mkdir(path.join(binarySnapshotSource, "data"), { recursive: true });
  const binaryBaselineIndex = "<!doctype html><title>binary baseline</title>\\n";
  const binaryBaselineQuality = '{"version":1}\\n';
  await writeFile(path.join(binaryCheckout, "index.html"), binaryBaselineIndex);
  await writeFile(path.join(binaryCheckout, "data", "quality.json"), binaryBaselineQuality);
  await writeFile(path.join(binarySnapshotSource, "index.html"), binaryBaselineIndex);
  await writeFile(path.join(binarySnapshotSource, "data", "quality.json"), binaryBaselineQuality);

  command("git", ["init", "-q"], binaryCheckout);
  command("git", ["config", "user.name", "operational-binary-fixture"], binaryCheckout);
  command("git", ["config", "user.email", "operational-binary-fixture@example.invalid"], binaryCheckout);
  command("git", ["config", "core.autocrlf", "false"], binaryCheckout);
  command("git", ["add", "-A"], binaryCheckout);
  command("git", ["commit", "-q", "-m", "binary fixture baseline"], binaryCheckout);
  const binarySnapshotCommit = command("git", ["rev-parse", "HEAD"], binaryCheckout).stdout.trim();
  assert.match(binarySnapshotCommit, /^[0-9a-f]{40}$/);

  const binaryArchivePath = path.join(work, "binary-repository.tar.gz");
  command("tar", ["-czf", binaryArchivePath, "."], binarySnapshotSource);
  const binaryArchiveBytes = (await stat(binaryArchivePath)).size;
  const binaryArchiveSha = await sha256File(binaryArchivePath);
  const binaryRegistryPath = path.join(work, "binary-snapshots.json");
  await writeFile(binaryRegistryPath, JSON.stringify({
    snapshots: [{
      id: "binary-snapshot",
      status: "pending",
      repository_commit: binarySnapshotCommit,
      public_release: {
        tag: "binary-snapshot",
        url: "https://example.invalid/releases/binary-snapshot",
        assets: [{
          kind: "repository-snapshot",
          name: "binary-repository.tar.gz",
          sha256: binaryArchiveSha,
          bytes: binaryArchiveBytes,
          url: "https://example.invalid/binary-repository.tar.gz",
        }],
      },
    }],
  }, null, 2) + "\\n");

  const binaryImage = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0x7f, 0xff, 0xd9]);
  await mkdir(path.join(binaryCheckout, "images"), { recursive: true });
  await writeFile(path.join(binaryCheckout, "images", "new.jpg"), binaryImage);
  await writeFile(path.join(binaryCheckout, "data", "quality.json"), '{"version":2,"image":"new.jpg"}\\n');
  command("git", ["add", "-A"], binaryCheckout);
  command("git", ["commit", "-q", "-m", "add exact binary asset"], binaryCheckout);
  const binaryTargetHead = command("git", ["rev-parse", "HEAD"], binaryCheckout).stdout.trim();
  assert.match(binaryTargetHead, /^[0-9a-f]{40}$/);

  const binaryRestore = await runRepositoryRestoreDrill({
    checkoutRoot: binaryCheckout,
    registryPath: binaryRegistryPath,
    archivePath: binaryArchivePath,
    snapshotId: "binary-snapshot",
    targetHead: binaryTargetHead,
    workRoot: path.join(work, "binary-restore"),
    outputPath: path.join(work, "binary-restore-receipt.json"),
    install: false,
    gate: false,
  });
  validateRestoreReceipt(binaryRestore.receipt);
  assert.deepEqual(await readFile(path.join(binaryRestore.restoredRoot, "images", "new.jpg")), binaryImage);
  assert.deepEqual(binaryRestore.receipt.forward_recovery.binary_paths, ["images/new.jpg"]);
  assert.equal(binaryRestore.receipt.forward_recovery.binary_patch_transport, true);
  assert.ok(binaryRestore.receipt.forward_recovery.changed_paths.includes("images/new.jpg"));
  assert.ok(binaryRestore.receipt.forward_recovery.changed_paths.includes("data/quality.json"));
  assert.throws(() => validateRestoreReceipt({
    ...binaryRestore.receipt,
    forward_recovery: {
      ...binaryRestore.receipt.forward_recovery,
      binary_paths: ["images/missing.jpg"],
    },
  }), /binary path is absent/);
  assert.throws(() => validateRestoreReceipt({
    ...binaryRestore.receipt,
    forward_recovery: {
      ...binaryRestore.receipt.forward_recovery,
      binary_patch_transport: false,
    },
  }), /binary patch transport/);

  console.log("PASS — operational restore and rollback evidence contracts, binary patch round-trip, tamper refusal, exact-byte recovery, and review boundary");'''
if fixture.count(fixture_anchor) != 1:
    raise SystemExit(f"expected one fixture completion anchor, found {fixture.count(fixture_anchor)}")
fixture = fixture.replace(fixture_anchor, fixture_replacement)

if fixture.count("runRepositoryRestoreDrill") != 2:
    raise SystemExit("binary restore fixture import/call count drifted")
if fixture.count("images/new.jpg") < 3:
    raise SystemExit("binary asset custody fixture is incomplete")
FIXTURE.write_text(fixture, encoding="utf-8")

print("patched operational reliability for exact binary forward recovery")
