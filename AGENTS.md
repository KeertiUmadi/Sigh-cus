<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI calls go through a createServerFn that reads LOVABLE_API_KEY inside the handler (src/lib/remix.functions.ts); why: key must stay server-side.
- Plant expressions use existing event pulses and mood in the Plant component, with reduced-motion-aware CSS; why: visual reactions stay synchronized without extra AI or voice calls.
- Camera blink observations are latched in timestamped readings for the slower habit timer; why: short blinks must reset staring even between timer ticks.
- Phone-use monitoring infers downward gaze or head-down posture supported by a hand below the face, without a slouch veto; why: phone posture overlaps slouch and this client-side tracker does not recognize phone objects.
- Demo entry and controls are gated after hydration to local hosts and Lovable editor preview hosts; why: the same deployed code must keep simulated actions off public sites without hydration mismatches.
- Camera sessions calibrate against the user's upright readings before monitoring; why: synthetic demo proportions do not match real camera geometry.
- Gerald's cross-application corner uses Document Picture-in-Picture with shared React state and its own scheduling window; why: ordinary page widgets cannot stay above other applications.
