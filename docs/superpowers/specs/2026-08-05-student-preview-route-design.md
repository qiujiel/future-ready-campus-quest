# Student Preview Route Design

## Goal

Make the synthetic student preview demonstrate the advertised campus route in
order: Group Studio, Briefing Plaza, Diagnostic Gate, and Adaptive Learning
Labs. The preview remains local, synthetic, and independent of Supabase.

## Selected approach

Add two explicit states to `StudentExperiencePreview`: `briefing` and
`diagnostic`. Group Studio advances to Briefing Plaza, Briefing Plaza advances
to Diagnostic Gate, and Diagnostic Gate advances to the existing Learning Labs
map. Each new state uses the existing `QuestShell` and a compact
`preview-callout`, so the route looks and behaves like the rest of the preview
without creating a second assessment system.

The alternative of changing only the progress indicator was rejected because
students would still never experience the missing stages. Building a complete
synthetic diagnostic assessment was also rejected because this change is about
route clarity, while the existing mission already demonstrates response and
feedback behavior.

## Experience and state flow

The preview state sequence is:

1. `join`
2. `studio`
3. `briefing`
4. `diagnostic`
5. `map`
6. `mission`
7. `results`

Briefing Plaza is the current destination with no completed phases. Its copy
introduces the group journey and teacher-led pacing. Diagnostic Gate is the
current destination with Briefing Plaza completed. Its copy explains that the
baseline check guides the learning route and does not rank students. Adaptive
Learning Labs remains the current destination only after the diagnostic screen,
with Briefing Plaza and Diagnostic Gate marked complete.

## Boundaries

- No production route, gateway, database, authentication, or deployment
  workflow changes.
- No new dependencies or persistent state.
- All preview content remains clearly synthetic and does not save data.
- Existing accessibility semantics, reduced-motion controls, and campus map
  components are reused.

## Testing

A component journey test will render the real preview, complete the synthetic
join, and assert that the two new destinations appear in order before Learning
Labs. The Playwright journey will assert the same observable sequence. Existing
unit, function, type, lint, build, and bundle checks must remain green.
