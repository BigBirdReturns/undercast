#!/usr/bin/env bash
set -Eeuo pipefail

copy_stage_inputs() {
  local stage_ref="refs/remotes/origin/${STAGE_RESULT_BRANCH}"
  rm -rf "$STAGE_ROOT"
  mkdir -p "$STAGE_ROOT"
  for name in candidate-metadata.json candidate-paths.txt stage.json media-review.json media-resolution.json media-scout.json waterline-before-receipt.json claim.json batch.json results.json manifest.sha256; do
    git show "${stage_ref}:${STAGE_PREFIX}/${name}" > "$STAGE_ROOT/$name"
  done
}

review_pipeline() {
  rm -rf "$STAGE_ROOT" "$REVIEW_ROOT" "$FINAL_ROOT" "$DIAGNOSTIC_ROOT"
  mkdir -p "$STAGE_ROOT" "$REVIEW_ROOT" "$FINAL_ROOT" "$DIAGNOSTIC_ROOT"
  node --check "$CONTROLLER"
  git fetch --no-tags origin main "$ORIGINAL_CANDIDATE_BRANCH" "$STAGE_RESULT_BRANCH" "$FINALIZER_BRANCH"
  test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
  test "$(git show -s --format=%T refs/remotes/origin/main)" = "$CURRENT_TREE"
  test "$(git show -s --format=%P refs/remotes/origin/main)" = "$ORIGINAL_MAIN"
  test "$(git rev-parse "refs/remotes/origin/${ORIGINAL_CANDIDATE_BRANCH}")" = "$ORIGINAL_CANDIDATE_COMMIT"
  test "$(git show -s --format=%T "$ORIGINAL_CANDIDATE_COMMIT")" = "$ORIGINAL_CANDIDATE_TREE"
  test -z "$(git ls-remote --heads origin "refs/heads/${REBASED_CANDIDATE_BRANCH}")"
  test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"
  copy_stage_inputs
  test "$(jq -r .commit "$STAGE_ROOT/candidate-metadata.json")" = "$ORIGINAL_CANDIDATE_COMMIT"
  test "$(jq -r .tree "$STAGE_ROOT/candidate-metadata.json")" = "$ORIGINAL_CANDIDATE_TREE"
  test "$(jq -r .canonical_parent "$STAGE_ROOT/candidate-metadata.json")" = "$ORIGINAL_MAIN"
  test "$(jq -r .receipt_sha256 "$STAGE_ROOT/stage.json")" = "$(jq -r .stage_receipt_sha256 "$STAGE_ROOT/candidate-metadata.json")"
  test "$(sha256sum "$STAGE_ROOT/candidate-paths.txt" | awk '{print $1}')" = "$(jq -r .path_ledger_sha256 "$STAGE_ROOT/candidate-metadata.json")"
  test "$(wc -l < "$STAGE_ROOT/candidate-paths.txt" | tr -d ' ')" = "$(jq -r .path_count "$STAGE_ROOT/candidate-metadata.json")"

  git diff --name-only "$ORIGINAL_MAIN" "$CURRENT_MAIN" | LC_ALL=C sort > "$REVIEW_ROOT/maintenance-paths.txt"
  printf '%s\n' data/MEDIA-SEARCH-LATEST.json data/journal/media-search.jsonl > "$REVIEW_ROOT/expected-maintenance-paths.txt"
  diff -u "$REVIEW_ROOT/expected-maintenance-paths.txt" "$REVIEW_ROOT/maintenance-paths.txt"
  if grep -Fxq -f "$REVIEW_ROOT/expected-maintenance-paths.txt" "$STAGE_ROOT/candidate-paths.txt"; then
    echo 'Alice candidate overlaps the post-Anastasia maintenance delta' >&2
    exit 1
  fi
  ! grep -q '^\.github/' "$STAGE_ROOT/candidate-paths.txt"

  git switch -C "$REBASED_CANDIDATE_BRANCH" "refs/remotes/origin/main"
  while IFS= read -r file; do
    test -n "$file" || continue
    git checkout "$ORIGINAL_CANDIDATE_COMMIT" -- "$file"
  done < "$STAGE_ROOT/candidate-paths.txt"
  git diff --name-only | LC_ALL=C sort > "$REVIEW_ROOT/rebased-paths.txt"
  diff -u "$STAGE_ROOT/candidate-paths.txt" "$REVIEW_ROOT/rebased-paths.txt"
  git diff --check
  test -z "$(git diff --name-only -- data/MEDIA-SEARCH-LATEST.json data/journal/media-search.jsonl)"
  git add -A
  git config user.name undercast-alice-rebase
  git config user.email undercast-alice-rebase@users.noreply.github.com
  git commit -m 'Star Trek: rebase reviewed Alice candidate'
  local candidate_commit candidate_tree path_count path_ledger_sha256 stage_receipt_sha256 review_sha256
  candidate_commit="$(git rev-parse HEAD)"
  candidate_tree="$(git show -s --format=%T HEAD)"
  test "$(git show -s --format=%P HEAD)" = "$CURRENT_MAIN"
  git diff --name-only "$CURRENT_MAIN" "$candidate_commit" | LC_ALL=C sort > "$REVIEW_ROOT/rebased-committed-paths.txt"
  diff -u "$STAGE_ROOT/candidate-paths.txt" "$REVIEW_ROOT/rebased-committed-paths.txt"
  path_count="$(wc -l < "$REVIEW_ROOT/rebased-committed-paths.txt" | tr -d ' ')"
  path_ledger_sha256="$(sha256sum "$REVIEW_ROOT/rebased-committed-paths.txt" | awk '{print $1}')"
  stage_receipt_sha256="$(jq -r .receipt_sha256 "$STAGE_ROOT/stage.json")"
  git push origin "HEAD:refs/heads/${REBASED_CANDIDATE_BRANCH}"
  test "$(git ls-remote --heads origin "refs/heads/${REBASED_CANDIDATE_BRANCH}" | awk '{print $1}')" = "$candidate_commit"
  git fetch --no-tags origin main
  test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"

  export REBASED_CANDIDATE_COMMIT="$candidate_commit"
  export REBASED_CANDIDATE_TREE="$candidate_tree"
  npm ci --ignore-scripts
  node "$CONTROLLER" review 2>&1 | tee "$REVIEW_ROOT/review.log"
  review_sha256="$(jq -r .review_sha256 "$REVIEW_ROOT/independent-review.json")"
  test "$review_sha256" != null
  sha256sum "$CONTROLLER" > "$REVIEW_ROOT/controller.sha256"
  find "$REVIEW_ROOT" -type f ! -name manifest.sha256 -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$REVIEW_ROOT/manifest.sha256"

  {
    echo "candidate_commit=$candidate_commit"
    echo "candidate_tree=$candidate_tree"
    echo "path_count=$path_count"
    echo "path_ledger_sha256=$path_ledger_sha256"
    echo "stage_receipt_sha256=$stage_receipt_sha256"
    echo "review_sha256=$review_sha256"
  } >> "$GITHUB_OUTPUT"
}

finalize_pipeline() {
  rm -rf "$STAGE_ROOT" "$FINAL_ROOT" "$DIAGNOSTIC_ROOT/finalize"
  mkdir -p "$STAGE_ROOT" "$FINAL_ROOT" "$DIAGNOSTIC_ROOT/finalize"
  node --check "$CONTROLLER"
  git fetch --no-tags origin main "$STAGE_RESULT_BRANCH" "$FINALIZER_BRANCH" "$REBASED_CANDIDATE_BRANCH"
  test "$(git rev-parse HEAD)" = "$REBASED_CANDIDATE_COMMIT"
  test "$(git show -s --format=%T HEAD)" = "$REBASED_CANDIDATE_TREE"
  test "$(git show -s --format=%P HEAD)" = "$CURRENT_MAIN"
  test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
  test "$(git show -s --format=%T refs/remotes/origin/main)" = "$CURRENT_TREE"
  test "$(git rev-parse "refs/remotes/origin/${REBASED_CANDIDATE_BRANCH}")" = "$REBASED_CANDIDATE_COMMIT"
  copy_stage_inputs
  test "$(jq -r .receipt_sha256 "$STAGE_ROOT/stage.json")" = "$STAGE_RECEIPT_SHA256"
  test "$(jq -r .review_sha256 "$REVIEW_ROOT/independent-review.json")" = "$REVIEW_SHA256"
  local review_meta
  review_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${REVIEW_ARTIFACT_ID}")"
  test "$(jq -r .expired <<<"$review_meta")" = false
  test "$(jq -r .name <<<"$review_meta")" = star-trek-alice-independent-review-v2
  test "$(jq -r .digest <<<"$review_meta")" = "$REVIEW_ARTIFACT_DIGEST"

  npm ci --ignore-scripts
  node "$CONTROLLER" finalize 2>&1 | tee "$FINAL_ROOT/finalize.log"
  test "$(jq -r .status "$FINAL_ROOT/finalization.json")" = qualified
  test "$(jq -r .additional_lease_issued "$FINAL_ROOT/finalization.json")" = false
  sha256sum "$CONTROLLER" > "$FINAL_ROOT/controller.sha256"

  git fetch --no-tags origin main
  test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
  test "$(git show -s --format=%T refs/remotes/origin/main)" = "$CURRENT_TREE"
  test -z "$(git diff --name-only -- data/MEDIA-SEARCH-LATEST.json data/journal/media-search.jsonl)"
  git add -A
  git diff --cached --quiet && { echo 'Alice finalization produced no product delta' >&2; exit 1; }
  git diff --cached --check
  ! git diff --cached --name-only | grep -q '^\.github/'
  for required in data/review/adapter-sdk/star-trek-alice-cycle.json scripts/star-trek-alice-cycle.mjs data/WATERLINE-STATE.json data/journal/waterline.jsonl data/ESTATE-REGISTRY.json package.json; do
    git diff --cached --name-only | grep -Fxq "$required"
  done
  local product_tree product_commit product_tree_readback receipt_sha256 checker_sha256 reviewed_cycle next_task
  product_tree="$(git write-tree)"
  export GIT_AUTHOR_NAME=undercast-alice-publisher
  export GIT_AUTHOR_EMAIL=undercast-alice-publisher@users.noreply.github.com
  export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
  export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
  product_commit="$(printf '%s\n' 'Star Trek: publish Alice (character) cycle' | git commit-tree "$product_tree" -p "$CURRENT_MAIN")"
  test "$(git show -s --format=%T "$product_commit")" = "$product_tree"
  test "$(git show -s --format=%P "$product_commit")" = "$CURRENT_MAIN"
  test "$(git show -s --format=%s "$product_commit")" = 'Star Trek: publish Alice (character) cycle'
  git diff --name-only "$CURRENT_MAIN" "$product_commit" | LC_ALL=C sort > "$FINAL_ROOT/product-paths.txt"
  test -s "$FINAL_ROOT/product-paths.txt"
  ! grep -q '^\.github/' "$FINAL_ROOT/product-paths.txt"
  grep -Fxq data/review/adapter-sdk/star-trek-alice-cycle.json "$FINAL_ROOT/product-paths.txt"
  grep -Fxq scripts/star-trek-alice-cycle.mjs "$FINAL_ROOT/product-paths.txt"
  git push origin "$product_commit:refs/heads/main"
  for _ in $(seq 1 60); do
    test "$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')" = "$product_commit" && break E}backe-.mjs data/WAe-.mjs data/WAe-.mjs data/WAe-.mjs =-'cegit ls-re' cn-2pp}')" = "$protar-NAL_ROO\ =-'cegitA_ROOT/f")"
 puached ommit"
  git fetch ,nhtest "$(git show -s --format=%T "$product_commit")" = "$product_troduct_core' cn-rotar-NAL_ROO\ =-'cegitA_ROOT/f")"
 pI=%s "$produ{e.jsi --BOT/review.log"
  review_sha256="$(jq -r .r-uoorigin >swed Alice candidaoP56="$(jq -r .in)E}backe-.mjs dE}b)" = "$produc1adoduct-paths.txt
duc1adoduct-paths.txt
duc1adoduct-path ! LINE-STATE.jsoTATE.jso.nL" = "$pr"=P]s= "$pr"=P]s= "$pr"=P]ee:candidate_tre$produc/mach ,nhtest "$(gundepron[}o
    git diff -mepron[}m,!mmt ls-remote --heads ordidate_tre$produc/mach ,nhtest "$(g_task
  product0"Oask
  product0"Oaref}:${&te_tre$ig_task
  pproduct0"Oask
  product0"Oaref1on[}o
    git de=TAGE_RESULT_BRr) uc1adoduct-patIou-scRegitA_ROOT  git dsts
  noduM{ echo 'Aliceect-p '{print $1}')" = "$Bn'l git push origin "$pREGISTRY.json packaSTR-paproalisho A_ROem,!mmt ls-rem1ad$candidate_treeip 
hn= "du{e._p" = "$Bn'l git push origin "$pREGISTRY.jstE_ROOT/candioi GIorigin " = "$Bn'l giaigin " = "$Begin+ 0)$'8_sduct-paths.tch ,nhtes'{nT_MAIN" | Lds ordidate_tre$produdN" | Lds ordidate_tre
  pproductre
  pproducC.redger_shEte+ 0)$'8_ROO\ =-'cductre
  pproducC.redger_shEtid ' ')tordidate_tre$produdN" | Lds ordid- o-s:refs/heads/main"
  for _ in $(seq 1 "
  test "$(gid "
  test o  = "$product_commit" && break E}backem LdsEn"
  mit" && break E}backem LdsEn"
  mit" && break E}backem LdsEn"
  mit" && break E}backem LdsEn"
  mit"reaEdsEccr($protap=n/$pr"]['wshoi mit"r     nm Lp/adapte ordidash
se-formt8_sduct-ACT_DIsR" &-s:refs/head/head/hean"
 ead/head/h:eOn[}m,!meCT_:re's/heads/main"
  for _ in $'-.mjs dE}b)" =s"$FINAL_ROOT/fikUha2idate_tre$product-patIou-cfask
  e}tI{prinidatACT_DIsR" &-s:refs/head/head/hean"
  0)$'8_ROO\ =N'wshoi mrefs/head/headt=sesfs/heagparse HEAD)" = "$REBAstn'U0"Oask
  product0"Oaref1on[}o
    gicon        rcasL_ROO\ =-'cegitA_ROOds/main"
  for y                                                               n       u]
ilos{zo.nL" Ods/mainush           n nR00re8'gt'i,," O HEAD)" =  /TU_ROOT" "$DItcOLLE SEARCH-LATEST.jurR        npaths.tch fy")" = 'Star Trek: pu '{print $1}')rdi grep -qOOT      0Ms-rem}oH-LATEST.jurR        npaths.kpsduct-paths- TREE"
  test "$(git rev-pari')" = "$Bn'l git push origin "$pREGIoTgT.jurR        npaths.tchom"_ROOT/cuf1onsyn
  p /main"
  for _gOOT/cuf1onsyn
st.sh -:duc1adoduc/P "$hRRENT_TREE"
 :-dD uS0>EREE"
 :-dD uS0's/heads/m  IPeNT_TRERRENT_MAIN" | LC_ALL=C i\ =-'cegitA_ROOds/maind/hen $(seqad$candida'(ch fy")" = 'SAD).xrTq'T i\ =-'cegitA}')rdi grep -qOOT v =-'cegitA_ROOds/maind/h_ROOds/maind/h_ROOdsn5eqad$candida'(ch fy")" = A'cx_ROU in $'-.mjs dE}b)" =s"$uccr($pa'(ch fy")" = e dx)a0re8'gt'i,,_,b)" =s"$ucGIoTgT.jurR        npaths.tchom"_ROe          D    =s">ERths.tchom"_R*m"=e\ordidaP s"(giROOT/fpaths.tchom"_ROe         !" inrigin refs/heads/main | aeDE/h:eOn[<'.github<gt'i,,_,b)" =s"$ucGIoT   .receipnp1adoduc/Product0"Oarefct0"Oarefct0o$Bn'laaeDE/h:eOn[<'.github<gt'i,,#-sEap %s\n' nM(;f.s/maiE'h ,"eDE/h:eOn[<'.github<gt'i,,#-sEap %s\n':di oqK%s\n>apI=%s "$produOn[<'.githu            (            n    ee dx)a0ub<gt'i,,_name}"     ,,#-sEap %'rybe;?$ eo_troduct_co=-'cductre
  ^"     ,,#-sEap %'rybe;E_ROOT;$FINAL_ROOT" "$DIAGNOSTIC_ROOT/f<type f ! -name manifest.sha256 -prinr _gOOT/cuf1one     .log"
  reviphouths.tchom"_R*m"=e\ordidaP s"(giROOT/fpaths.tchom"_ROe         !" isrh   cT      !" isrh   cT      !" isrh   cT     tpt.sha256 -prinr _gOOT/cuf1one     .log"
-fct.3T.g"
-fs -prif1o                 raP gb)
-fct.3 in|     !" gOOSisrh   cT    s8m   pI=%s "$proa fetch --no-tags originf1one      =- cT  't push origref1onia-sen-'cductrnia-sen-'                     TESFOsESFO[a'Ymedipfes       TESFOsESFO[a'Ymedipfes       TESFOsESFO[a'Ymedipfealny_TREE"
  tesptsESFO[a'YmeE   TESFOsESFO[a'-}fvrSu[er.shac\a\ordidrsp /main"
  for _gO   TESFOsESFO[a'-}fvrSu[esp /main"
  | LC_ALL=C i\ =-'cegitA_ROOds/maind/hen $(seqad$candida'(ch fy")" = 'SAD).sTESFOsESFO[a'Ymedipfes       TESFOne{lHelta' >&2; exit wene{lHelta' >&2; exit wene{lHelta'  "$pr"eltaf$(seq 1 tlny_TREE"
  te .sTESFOsESF.sTESFOsESFO[a'YeCmin refs/$>igin maTESF'.github<gt'i,,#-s klU in $'-.m   TESFOsESFO[a'-}fvrSu[esp /main"
  | LC__a0ub" = 'SAD).ain"
  | LC__a TE cn& f ! -name manifest.shuSFOcuaFOc;srd| LC__a TE cn& .j$P).sT !"TAGE_REtb-d/h_RO'Ioa fetcen':'/_gOi1AssU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU")"
 popsU"bSahd feL
 TE cn& nfeL
 TE }SFO[eU")"
 popsU")"
 popsAO[eU")"so_trodo_trodo_trodo_trodo_trodo_trodovSsTESFOsESF.sTEnEeb" = 'SAD).ain"
  | LC__a TE cn& f ! -name maelIsR" &-s:refs/head/headwa|{adsDATE_COMMIT="$candty$candty$candty$candty$v;E_ROT" "$DIAGNOSee)"
  e& nfeL
 TEa-$"
  e& nfeL
 TeTIC_ROOT/f<type f ! -name manifest.sha256 On[<'.githnTe-metadata"
 metadata"
 ]t"
  | LC}SFO[eU")"
 poqtyiata"
 ?
 ]t"
  cT      !crigin "$product_cow{)"$STAGE_Rtadata"
 meta'SI nfct.3 Aut/fpei's(seq 1 "
  tey1pt.sha256 -prNpa nflDR]}$Bn'l gitilNtadataepsU")}E/_comm{      !|    in )<} nd/headwa|{adsDATE_COMMIT="$ci's(seq 1 "
  tey1pt.sha256 -prNpa nflDR]}i
 ]t"
  cT   'SAD).ain"
  | LC__a TE cmitA_ROOds/maind/h 1 tlny_oqtyiaeaTESF'.github<gt'i"
 popsAO[/h uAs= 'SAD).xrTq'T i\ =}]$hy( nfeL
 TeTI)loR,2feL
 TeTI)loR,2feL
 Tl|headwaprodSED_CANDIDATE_T i\ =}nrtDRFOsESF.sTEnEeb" = 'S$LL=CsU")opsUw}er "$produOn[<'.githu S$LL=CsU")opsUl.aind/"}x "$pr"eltaf$(seq'.githubdESFO[a'-}fvrSu[esp /main"
  | LC__fvrSu[esp /main"
  | LC__a0T(nIb'u_gn"
  " commit-t"=e\ordidaP s"(giROOseq 1 60); ta'  "$pr"eltaf$(seq 1 tlny_TREE"
  te .sTESFOsESF.sTESFOsESFO[a'YeCmin refs/$>igin maTESF'.github<gt'i,,#-s klU in $'-.m   TESFOsESFO[a'-}fvrSu[esp in $'-.m   TESFOsESFO[a'TESFOsESFO "$a/matecommip /main"
  |'^\.githAoadwaprodSED_CANDIDATE_lar-trek-alice-cycle.mjs e. $pREGIST/_.metadak
  git show -sSsqly1pt.sha2")"
 /adak
  git show chom"_R*m"=e\or
SFOdsha2")"
 /adak
  ggn':s-rem}oH-LATEST.jurR        npTeTI)loRtnpt.sha2")"
 /a-$"
  e&)Odsha2h                     TESFOsESFO[a-TEnEeb" = 'S$LL=CsU")opsUqlpsUw}e'fpESF'.gi_V'S$LL=Cs,Oain"
ussusDx /a-$"
  e&)Odsh$LLPficiDd^\.githAoadwaprodSED_CANDIDATE_lar-trek-alice-cycle.mjs e. rdwaprodSEDeIDATE_in"
  |psCED_CANDIDATE_
psUiRcIDATE_in"
  |psCfvrDa             rREGIST/_.metadak
  git show -sSsqly1pt.shDATa"=e\ordidaP s"(giROOT/fpaths.tcpdwapr'dTE_lar-sEap miv$s!s'Alicep\icepMsho A_ROem,!mmt ls  git show -sScepMsho A_ROem,!mm)sho A_ROem,!mm)sho A_=ovSsha2")"
 /a-$"
  e&)Odsha2h    _pUKem,"oN Ra"=e})          rREGIST/_.metadak
  git show -sSsqly1pt.shDATa"=e\ordidaP s"(giROOT/fpaths.tcpdwapr'dTE_lar-sEap miv$s!s'Alicep\icepMsho A_ROOT/fpaths< miv$s!R=Ml!s'Alicep\o AnT/fpatLL=CsU")opsUl.aind/"}x "$pr"eltaplpjas/maind/hen $(seqad$candida'(ch fy")"  tey'_CO=patLL=CsU")op,dG} !mehxho A_ROOa"=e")opsUlnye   .log)"
Rne ls  git shoFLL=Cs,Oai[TeTI)loRtnpt.sha2")"
 /Ulnyeatha=git$ e lssoIOha=gF"
Rne ls  git shoFLL=Cs,Oai[TeTI)loRtnpt.sU")"
 d:TE_larGm#dy1p.sU"}")}E/_coFLL=Cs,Oa"(giROOT/"}x | aeDE/$P]}i
 ]t"
  Mo[;icep\/${RE) ocf-rem}oH-seE A TE cO  te .sTESFOsEcO  $e ls  g&adak
  Cs,Oai[TeTI)loRtnpt.W]pSFOcO  te } diffoRteEcO  $e ls  g&ada ]t"
2/NDIDATE_
psUiRcIDATE_in"
  |psCfvraxeRloRtnpt.W]pSFOcO 5o^wtptnpt.sATE