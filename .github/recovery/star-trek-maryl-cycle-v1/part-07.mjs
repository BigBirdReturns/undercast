      checker_path: checkerPath,
      denominator: 2228,
      resolved_floor: 425,
      checker_sha256: checkerSha,
    },
    boundary: {
      queued_mode_hint_promoted: false,
      role_or_maker_conflated: false,
      original_maryl_body_inferred: false,
      erica_mer_reflection_conflated: false,
      maker_attributed: false,
      transformation_measured: false,
      cross_facet_substitution: false,
      outside_human_dependency: false,
      owner_physical_action_required: false,
      additional_lease_issued: false,
    },
  };
  const receipt = { ...receiptBody, receipt_sha256: sha(Buffer.from(stablePretty(receiptBody))) };
  writeJson(receiptPath, receipt);

  const pkg = readJson('package.json');
  pkg.scripts['star-trek:maryl-cycle:check'] = 'node scripts/star-trek-maryl-cycle.mjs';
  if (!pkg.scripts['autopilot:fixtures'].includes('npm run star-trek:maryl-cycle:check')) pkg.scripts['autopilot:fixtures'] += ' && npm run star-trek:maryl-cycle:check';
  writeJson('package.json', pkg);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  node(checkerPath);

  const finalWaterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(finalWaterline.phase === 'ready-for-cycle' && finalWaterline.claim_allowed === true, `Maryl final waterline is ${finalWaterline.phase}`);
  const finalNext = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(finalNext.phase === 'ready-for-one-cycle', 'Maryl final thesis rail did not return to collection');
  writeJson(path.join(finalRoot, 'receipt.json'), receipt);
  writeJson(path.join(finalRoot, 'waterline.json'), finalWaterline);
  writeJson(path.join(finalRoot, 'next.json'), finalNext);
  writeJson(path.join(finalRoot, 'finalization.json'), {
    version: 1,
    transaction: 'STAR-TREK-MARYL-FINALIZATION-V1',
    status: 'qualified',
    canonical_parent: EXPECTED_MAIN,
    candidate_commit: env.CANDIDATE_COMMIT,
    task_id: TASK_ID,
    wall_id: stageDoc.wall_id,
    receipt_sha256: receipt.receipt_sha256,
    checker_sha256: checkerSha,
    reviewed_cycle: cycle.id,
    next: finalNext.candidate,
  });
  console.log(JSON.stringify({ status: 'qualified', wall_id: stageDoc.wall_id, receipt_sha256: receipt.receipt_sha256, checker_sha256: checkerSha, cycle_id: cycle.id, next: finalNext.candidate }, null, 2));
}

try {
  if (cmd === 'stage') stage();
  else if (cmd === 'review') review();
  else if (cmd === 'finalize') finalize();
  else throw new Error('usage: star-trek-maryl-cycle-v1.mjs <stage|review|finalize>');
} catch (error) {
  console.error(`maryl-cycle: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
}
