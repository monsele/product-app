# Workspace UI Review

**Reviewed:** 2026-09-22  
**Page:** `/workspace`  
**Context:** Local development environment, signed in with a test account and viewing an empty workspace.

## Overall assessment

The workspace is calm, tidy, and easy to scan. The page makes the primary next step—creating a lesson—clear, while the soft lavender accent and generous spacing support the product's teacher-focused tone.

## What works well

- The “Your lessons” heading and supporting sentence establish the page purpose immediately.
- The lesson-creation card is prominently placed and its project-title field is easy to understand.
- The empty state explains the expected source material and the intended result in plain language.
- The supporting-sources and privacy panel builds confidence by explaining file limits, supported formats, and how uploads are handled.

## Opportunities to improve

1. **Consolidate the primary action.** The page displays “Create lesson” in both the creation form and the empty state. The repeated action competes for attention; retaining the form's action as the single primary control would make the workflow more direct.
2. **Make the first workflow step more explicit.** A compact cue such as “1. Name lesson → 2. Upload source” would turn the current card into a more tangible, predictable flow.
3. **Rebalance the two-column layout.** The contextual guidance panel is useful but takes a substantial amount of horizontal space from the creation area. Consider reducing its width, collapsing it on smaller viewports, or moving parts of its content closer to the upload step.
4. **Review empty-state density.** The current empty state uses considerable vertical space before any lesson exists. Tightening it slightly would keep the primary form higher in the visual focus area.

## Functional issue observed

The header displayed `teacher@school.org` after registering and signing in with a different local test-account email. The header should render the authenticated user's actual email, or a chosen profile display name, rather than a static or incorrect identity.

## Suggested priority

- **High:** Correct the signed-in identity shown in the header.
- **Medium:** Remove or demote the duplicate empty-state “Create lesson” action.
- **Medium:** Add a short create-and-upload progress cue.
- **Low:** Rebalance the guidance panel and empty-state spacing after testing at mobile and tablet widths.
