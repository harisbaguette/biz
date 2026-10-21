<!-- project-map:start -->
이 프로젝트의 진행 기록은 .project-map/state.json이다.
`node "$HOME/.local/share/project-map/cli.cjs" status --since 마지막revision --root .`로 변경분을, `read --kind tasks --brief --open`으로 열린 작업만 읽는다. 처음 읽을 때는 --since를 뺀다.
별도 요청 없이 작업 중 새 요구·구현 사실·검증 결과에 맞춰 누락 작업, 의존관계, 완료 조건, 막힘을 보완한다. 다음 작업에 영향을 주는 변경은 바로, 나머지는 의미 있는 작업 단위가 끝날 때 기록하고 완료·인계 전 실제 결과와 대조한다. 기존 ID·사용자 답·유효한 완료는 보존하며 변경이 없으면 다시 쓰지 않는다.
큰 결과물은 마일스톤으로 묶고, 독립적으로 완료·실패·대기를 확인할 수 있게 작업을 나눈다. 각 작업 노트에 산출물·담당·실제로 쓸 목록 항목/전문가/스킬/에셋의 ID나 경로와 용도·완료 조건을 적는다. 선행 대기는 dependsOn, 실제 막힘은 blockedBy에 원인·해소 조건·다음 행동으로 남긴다. 자세한 작성 기준은 Codex는 ~/.agents/skills/kh-skill-project-start/task-planning.md, Claude Code는 ~/.claude/skills/kh-skill-project-start/task-planning.md에 있다.
기록 갱신은 `apply`, 명령·스키마는 `help`. 사용자 변경을 반영하고 실제 확인 결과를 evidence에 남긴다. 실행을 등록한 작업은 `verify --id 작업ID`로 확인하며 유효한 결과는 재사용한다.
지도는 현재 요청의 범위를 넓히거나 의무 검토·완료 검사를 추가하지 않는다. HTML은 자동 생성된다.
<!-- project-map:end -->
