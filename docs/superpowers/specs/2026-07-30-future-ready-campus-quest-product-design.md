# Future-Ready Campus Quest: Product and Learning Design

**Status:** Approved design captured for written review
**Date:** 30 July 2026
**Audience:** Course owner, instructional designer, developer, and reviewer
**Primary learners:** Approximately 30 pre-service teachers in one in-class cohort

## 1. Product vision

Future-Ready Campus Quest is a mobile-first, 30-minute classroom experience that helps pre-service teachers apply the assigned readings rather than reread them on screen. Learners enter a playful campus-map game, complete a short diagnostic, follow an adaptive sequence of classroom-design scenarios, take a low-stakes assessment, correct one weak area, and see their team's progress.

The experience is based on:

1. `dflt-session-1-overview-of-ict-in-the-singapore-education-system-aug-2026.pdf`
2. `dfrlt-session-1-21st-century-quality-learning-aug-26.pdf`

The PDFs remain required pre-reading. The app may create new classroom scenarios and paraphrased feedback, but every assessed concept and correct answer must be traceable to the readings.

The reviewable concept map and 24-item question blueprint are stored locally at `protected-content/2026-07-30-future-ready-campus-quest-content-assessment-blueprint.md`. That file is intentionally excluded from Git so it cannot become part of a public repository.

## 2. Goals

The module will:

- Diagnose each learner's prior understanding across all major concepts.
- Give more support and practice to weaker concepts without omitting any major concept.
- Require application, comparison, diagnosis, and redesign rather than simple recall.
- Make the experience playful and visually memorable without trivialising the subject.
- Give teams a shared reason to participate while protecting individual learners from public ranking.
- Give the teacher actionable evidence about questions, misconceptions, concepts, groups, and individual students.
- Work well on phones while remaining usable on tablets and laptops.
- Keep copyrighted course materials and learner data out of the public GitHub Pages bundle.

## 3. Non-goals

The first release will not:

- Replace the two assigned PDFs.
- Reproduce PDF pages, screenshots, diagrams, extended passages, or downloadable copies inside the app.
- Use an LLM to score student responses during the live session.
- Provide open public registration.
- Provide high-stakes examination controls or formal proctoring.
- Include class-visible individual rankings.
- Award points for speed.
- Support multiple institutions, payment, messaging, or a general-purpose course-authoring marketplace.

## 4. Success criteria

### Learning success

- Every student encounters C1-C8 during the diagnostic and final assessment.
- At least 80% of learners complete the full experience within 30 minutes.
- Class-level final accuracy exceeds diagnostic accuracy for at least six of the eight concept clusters.
- Each student receives targeted feedback for at least one diagnosed weakness.
- Every scored item has a source reference, answer rationale, and misconception tag.

### Experience success

- A new cohort of 30 students can enter the activity within two minutes.
- The experience remains usable at a 360 CSS-pixel viewport width.
- No required action depends on hover, precise dragging, sound, or animation.
- Students can resume after a refresh or brief loss of connectivity.
- The teacher can identify the three weakest class concepts and most-missed questions within ten seconds.

### Privacy and operational success

- Internet-accessible pages reveal no individual names, individual scores, answer keys, or protected learning content.
- Real names are visible only to the teacher.
- Group pictures are visible only to authenticated members of the class and the teacher.
- The teacher can lock rosters, hide rankings, remove an image, pause the experience, and reset a student session.

## 5. Users and permissions

### Student

A student can:

- Join the active class and select the group number assigned by the teacher.
- Enter a real name for the teacher and an optional nickname for peers.
- Help choose a group name and upload a representative group picture.
- Complete the diagnostic, adaptive missions, final assessment, retry, and reflection.
- See personal progress, feedback, and the team leaderboard.

A student cannot:

- See another student's real name or individual score through the leaderboard.
- Read answer keys before submitting an item.
- Change the immutable teacher-assigned group number.
- access another cohort's content or records.
- edit the question bank, scoring rules, or teacher settings.

### Teacher

A teacher can:

- Create and open a cohort.
- Configure numbered groups and capacities; the default is five groups of six.
- Observe onboarding and mission progress in real time.
- Lock or unlock group rosters and group identity editing.
- Moderate group names and images.
- Pause or resume the activity and hide or reveal team rankings.
- Review class, concept, question, misconception, group, and individual results.
- Export a CSV report without answer keys.
- Reset a student's access session.

## 6. Thirty-minute learner journey

| Stage | Time | Learner activity | Evidence produced |
|---|---:|---|---|
| Mission briefing and group onboarding | 2 minutes | Join assigned group, create profile, see or optionally customise team identity, read the challenge | Group membership and profile |
| Adaptive diagnostic | 5 minutes | Answer eight short scenario-based items, one per concept cluster | Baseline accuracy, confidence, misconception tags |
| Adaptive missions | 14 minutes | Complete approximately six applied scenarios with support determined by diagnostic performance | Practice responses, hints used, explanations viewed, mastery updates |
| Final challenge | 6 minutes | Complete eight new scenario items, one per concept cluster, in one scored attempt | Final accuracy and concept mastery |
| Targeted retry and reflection | 3 minutes | Correct one weak concept and record one teaching-design takeaway | Retry result and reflection completion |

If a learner needs extra time, the system prioritises completion of the final assessment over optional mission embellishments. Group naming and image upload are non-blocking; a generated name and avatar remain in place until a group chooses to customise them.

## 7. Adaptive learning model

### 7.1 Diagnostic

The diagnostic contains eight items, one for each concept cluster C1-C8. Each item records:

- Correct or incorrect.
- Selected misconception, where applicable.
- Confidence: unsure, somewhat sure, or very sure.
- Response time for teacher analysis only; response time never affects score.

### 7.2 Initial routing

Each concept begins in one of three support states:

| State | Diagnostic signal | Practice treatment |
|---|---|---|
| Needs support | Incorrect, or correct with low confidence | Worked example, concise concept reminder, guided scenario, targeted feedback |
| Developing | Correct with medium confidence | Standard scenario, feedback, and a follow-up decision |
| Secure | Correct with high confidence | Compressed refresher and a harder transfer scenario requiring justification |

### 7.3 Coverage rule

No concept is fully skipped. Every learner encounters C1-C8 in the diagnostic and final assessment. The adaptive engine changes practice depth, scaffolding, and challenge, not core coverage.

### 7.4 Mastery update

Mastery is tracked independently for C1-C8 on a 0-100 internal scale:

- Diagnostic evidence establishes the initial estimate.
- Correct unassisted practice increases mastery more than a correct response after a hint.
- Incorrect practice followed by a correct explanation-based retry records improvement without erasing the original misconception.
- Final assessment evidence has the greatest weight.
- The scale supports routing and reporting; it is not shown as a false claim of precise learning measurement.

### 7.5 Fallback

If the adaptive service is unavailable, the learner receives a deterministic balanced path containing one practice scenario from each broad territory. Completion and answers are queued for later synchronisation.

## 8. Game and interaction design

### 8.1 Theme

The selected visual direction is **Future-Ready Campus Quest**. Learners act as learning designers helping a simulated campus respond to technology-enabled teaching challenges.

The world uses:

- A colourful illustrated campus map.
- Distinct territories for the four broad content areas.
- Friendly guide characters that frame missions and feedback.
- Sticker-like badges, expressive scenario cards, and visible progress paths.
- Bright coral, violet, teal, warm yellow, and deep navy.
- Rounded but substantial typography suitable for adult learners.

The tone is energetic, clever, and optimistic rather than childish.

### 8.2 Motion

Motion supports orientation and feedback:

- Map travel between missions.
- Spring-based card entrances.
- A brief glow or badge celebration for meaningful progress.
- Animated concept links when feedback explains a relationship.
- A restrained team-score reveal.

All motion must:

- Respect `prefers-reduced-motion`.
- have a no-motion equivalent.
- Avoid blocking interaction.
- Avoid flashing, autoplay audio, or excessive particles.
- Use transforms and opacity where practical for performance.

### 8.3 Interaction patterns

Approved item interactions include:

- Tap-to-select scenario decisions.
- Tap-to-classify examples.
- Ordering with accessible move-up and move-down controls.
- Multi-select decisions.
- Two-stage diagnose-and-redesign scenarios.
- Short reflection prompts with a 240-character limit.

Required tasks will not depend on drag-and-drop. Drag may be offered as an enhancement only when the same operation is possible using buttons and keyboard controls.

### 8.4 Feedback

Feedback follows a four-part structure:

1. State whether the reasoning aligns with the reading.
2. Name the concept.
3. Explain why the selected option works or fails in the scenario.
4. Give a concise transfer prompt: "What would you change as the teacher?"

Feedback must not simply repeat the correct option.

## 9. Group onboarding and identity

### 9.1 Onboarding

1. The teacher opens the cohort and numbered group slots.
2. Students open the class link or scan the shared class QR code.
3. Each student selects the teacher-assigned group number.
4. Each student enters a real name and, optionally, a nickname.
5. The system creates a persistent session on that device without email, password, or PIN entry.
6. The teacher reviews the roster and locks it when onboarding is complete.

The immutable database identity is the group ID, not the editable group name.

### 9.2 Names

- Real name is required and visible only to the teacher.
- Nickname is optional and visible to group members.
- If no nickname is entered, the interface uses a neutral generated label for peer-facing displays.
- No student name appears on the class-visible team leaderboard.

### 9.3 Group identity

Group members can:

- Agree on a group name.
- Use one temporary group editor to save the agreed name and upload one representative image: a photo, logo, illustration, or avatar.
- Replace the image while group editing is open.

The first student to join becomes the temporary group editor. The teacher can transfer that role, and the editor can hand it to another member. This prevents simultaneous edits from overwriting one another.

Constraints:

- Accepted formats: JPEG, PNG, or WebP.
- Maximum upload before processing: 5 MB.
- Client-side processing produces a WebP image no larger than 1200 x 1200 pixels and approximately 1 MB.
- Images are stored in a private class-scoped bucket.
- The uploader confirms that the group agrees to share the image within the class.
- The teacher can remove or replace an image and lock edits.

## 10. Assessment design

### 10.1 Low-stakes scored model

The final challenge allows:

- One scored first attempt.
- Immediate explanations after the attempt is submitted.
- One targeted retry on a weak concept.
- Separate storage of first-attempt and retry evidence.

The retry improves the learning record but does not overwrite the original response.

### 10.2 Individual score

Individual results are teacher-only. The score includes:

- Final assessment accuracy.
- Diagnostic-to-final improvement.
- Mission completion.
- Reflection completion.

No class-visible screen shows individual rank.

### 10.3 Team score

The team score is the average of member contributions, so team size does not create an advantage:

| Component | Weight |
|---|---:|
| Final mastery | 60% |
| Diagnostic-to-final improvement | 25% |
| Mission completion | 10% |
| Reflection completion | 5% |

Rules:

- Speed does not affect score.
- The class-visible leaderboard shows team name, image, progress, and score only.
- The teacher may hide rankings until all teams finish.
- The interface avoids a prominent "last place" treatment.
- Ties share the same rank; no hidden speed-based tie-breaker is used.

## 11. Teacher dashboard

### 11.1 Live mission control

The live view shows:

- Students joined and active.
- Team onboarding status.
- Learners at each journey stage.
- Connectivity or stalled-session warnings.
- Class completion percentage.
- A control to pause/resume the activity.
- A control to hide/reveal rankings.

### 11.2 Learning analytics

The analysis view supports:

- C1-C8 concept mastery heatmap.
- Diagnostic and final accuracy by concept.
- Diagnostic-to-final change.
- Most-missed questions.
- Misconception frequency.
- Confidence/accuracy mismatches.
- First-attempt and retry comparison.
- Group comparison without using group rank as a proxy for individual ability.
- Private student drill-down.

### 11.3 Question analysis

For each question, the teacher sees:

- Question ID and concept tags.
- Item type and source pages.
- Number of responses.
- Option distribution.
- Correct percentage on first attempt.
- Correct percentage after retry, where applicable.
- Associated misconception labels.
- Link to the approved answer rationale.

### 11.4 Export

CSV export contains cohort, group, private student name, nickname, concept results, question results, completion, and reflection status. It excludes answer keys and protected item content by default.

## 12. Content integrity and copyright

Both source PDFs state that their contents must not be reproduced, adapted, or publicly displayed without permission. The product therefore uses the following controls:

- The PDFs remain local source files and are excluded from Git.
- No PDF page, screenshot, diagram, image, or extended quotation is copied into the public repository.
- App content is paraphrased and scenario-based.
- Every concept, item, and explanation stores a private source reference.
- Protected learning content is fetched only after cohort entry and is not bundled into GitHub Pages.
- The teacher or course owner must review and approve the content bank before deployment.
- Access is restricted to the authorised cohort.

This design records operational safeguards and does not replace institutional copyright or data-protection review.

## 13. Mobile, accessibility, and inclusion

- Responsive layouts support 360 px phones through desktop displays.
- Minimum target size is 44 x 44 CSS pixels.
- Text supports browser zoom to 200% without loss of function.
- Colour is never the only indicator of correctness, rank, or progress.
- All interactions have visible focus states and keyboard equivalents.
- Scenario graphics include concise alternative text.
- Captions and transcripts are required for any future audio or video.
- Reduced-motion mode replaces map travel and celebrations with instant state changes.
- The teacher can grant extra time without changing score.
- Reconnection and resume controls use plain language.
- Photos are optional; a generated group avatar is always available.

Target conformance is WCAG 2.2 AA.

## 14. Failure handling

| Failure | Learner experience | Teacher experience |
|---|---|---|
| Brief loss of connectivity | Current response is saved locally and retried; learner can continue with cached shell | Dashboard marks learner as temporarily offline |
| Duplicate submission | Existing idempotent result is returned | No duplicate score |
| Session lost | Learner requests teacher-assisted reset and resumes the same profile | Teacher resets session without deleting progress |
| Group image upload fails | Existing avatar remains; retry and file guidance are shown | Upload failure is visible; teacher may upload replacement |
| Leaderboard update fails | Last confirmed score remains with "updating" label | Teacher sees stale-data timestamp |
| Adaptive route fails | Balanced fallback path is assigned | Error is logged without exposing learner data |
| Final submission partially fails | Local receipt is retained until server acknowledgement | Dashboard shows pending submission, not zero score |

## 15. Product acceptance criteria

The design is ready for implementation when all of the following are testable:

- A teacher can create one cohort with five numbered groups and 30 seats.
- Thirty students can join, select assigned groups, and create private/public identity fields without email, password, or PIN entry.
- A group can select a name and upload a moderated class-scoped image.
- Every learner receives eight diagnostic items covering C1-C8.
- Routing selects support, developing, or secure practice per concept.
- Every learner completes a final item for C1-C8.
- One targeted retry preserves both original and retry evidence.
- Team scoring uses the approved weights and never uses time.
- Class-visible ranking exposes no individual identity or score.
- Teacher analytics identify concept, question, and misconception patterns.
- Protected content and answer keys are absent from the GitHub Pages artifact.
- The full journey works on representative mobile and desktop browsers with keyboard and reduced-motion modes.

## 16. Delivery scope

Implementation should be planned as three coordinated workstreams that produce one MVP:

1. **Learning core:** content model, diagnostic, adaptive routing, missions, assessment, feedback, mastery, and scoring.
2. **Classroom experience:** group onboarding, Campus Quest interface, team identity, leaderboard, accessibility, and mobile behaviour.
3. **Teacher and platform:** teacher controls, analytics, content protection, data policies, deployment, monitoring, and exports.

The AI development prompt will be written only after the product, content/assessment, and technical specifications are reviewed and approved.
