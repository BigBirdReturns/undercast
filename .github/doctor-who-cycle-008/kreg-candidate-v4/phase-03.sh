#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
evidence="$OUT/evidence-metadata"
mkdir -p "$evidence"
bind() {
  local label="$1" run="$2" job="$3" job_name="$4" artifact="$5" artifact_name="$6" digest="$7" head="$8"
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run" > "$evidence/$label-run.json"
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?per_page=100" > "$evidence/$label-jobs.json"
  gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact" > "$evidence/$label-artifact.json"
  jq -e --argjson id "$run" --arg head "$head" '.id==$id and .status=="completed" and .conclusion=="success" and .event=="pull_request" and .head_sha==$head' "$evidence/$label-run.json" >/dev/null
  jq -e --argjson id "$job" --arg name "$job_name" 'any(.jobs[]; .id==$id and .name==$name and .status=="completed" and .conclusion=="success")' "$evidence/$label-jobs.json" >/dev/null
  jq -e --argjson id "$artifact" --arg name "$artifact_name" --arg digest "sha256:$digest" --argjson run "$run" '.id==$id and .name==$name and .digest==$digest and .expired==false and .workflow_run.id==$run' "$evidence/$label-artifact.json" >/dev/null
}
bind preflight 31088359558 92573114327 preflight 8962423257 doctor-who-cycle-008-preflight-v3-31088359558 38c606f921bdd06f3285967b37194dc50cc558bba43c115aee5d88045f9d445c e44f5578c31bccd9e9271af12d16171f592870ad
bind census 31110331798 92646143078 census 8971420444 doctor-who-cycle-008-kreg-media-recovery-v11-single-deletion-census-31110331798 75dab09bac152256ba5b9f471b244af1916b509d453e60adbc39d5aa7503905c 56a927b3c8b10587e934921138beff1a5d5b49e0
bind review 31110923065 92648203918 review 8971625526 doctor-who-cycle-008-kreg-independent-media-review-v1-31110923065 3e9d57566cddd961074a7f46839b565bb797d86958993f555cb5add9f5982b5c 88ef52960f8aa06541677abb891fa4cf1f41669a
bind observer 31112660901 92654179738 observe 8972359020 doctor-who-cycle-008-kreg-media-prepublish-v1-observer-31112660901 40a7726498b5d2030b732c78a4da51e5da821fb622c6cc4e616489f48962d339 9ffea597467c5475c40328770f9ac42b030b9105
