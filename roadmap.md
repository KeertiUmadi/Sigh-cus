# Sigh-cus — build roadmap

- [x] Improve calibrated slouch detection and restore Gerald’s always-on-top window; 29 tests pass and floating window opens, receives live demo reactions, and closes without errors. Publish and synchronize both GitHub copies. Real-camera accuracy and OS-level window stacking need user verification; desktop Chrome/Edge required.

- [x] Restore camera button contrast and remove demo invitations; verified readable camera label in preview and public-host layout with no demo text or runtime errors.
- [x] Request publication of the camera label and wording corrections; synchronize the changed files to both GitHub copies, preserving existing UI and detection changes.

- [x] Add varied incredulous reactions and conversational voice settings; 26 tests pass, a live text response and correction verified, demo entry absent on the public host and available locally. Preview only; audio listening check deferred to avoid spending ElevenLabs credits.

- [x] Rename trigger settings to “Manage My Disappointment” and fix missed blinks and phone-use signals — 25 tests passed; verified settings, phone nag and immediate correction in demo mode; real-camera verification and publication still pending

- [x] Give Gerald expressive squints, eye-rolls, pressed lips and annoyed pot shakes; verified all seven expressions in the preview
- [x] Expression-preview button — removed at the user's request; Gerald's facial reactions (squint, eye-roll, pressed lips, head shake) still fire on their own from real events

- [x] Webcam posture + water detection (MediaPipe face landmarks, graceful fallback)
- [x] Guilt line writing via Gemini (server function, key stays server-side)
- [x] Guilt-streak chart (mood trail with drink and slouch markers)
- [x] Plant visual that withers, droops and blooms + theatrical notifications
- [x] Test the state-machine rules (2-minute slouch, drink detection, nags) — 14 tests green
- [x] Verify end-to-end in the browser (demo mode: drink cheers, slouch nags, chart fills)
- [x] ElevenLabs spoken sighs and gospel cheers — key permissions ticked, voice live
- [x] Backboard memory of past sessions — done: the user's key is saved as a secret, Gerald records each nag, drink and habit with a date and can refer back on later visits; verified in demo mode (a memory profile is created and the event saved)
- [ ] Tiger Data streak history — blocked: needs Lovable Cloud enabled
- [x] Custom domain for the app — done with sigh-cus.design; fernforgivemenot.live was not bought and is not needed
- [x] Code is on GitHub at github.com/KeertiUmadi/Sigh-cus — 86 project files plus a README, pushed through the linked GitHub connection
- [x] Copy the code into the team repo github.com/ShubhangiPurohit-dev/Sigh-cus — done after Shubhangi added Keerti as a collaborator: all 87 files on main, verified the copy reads as real source and contains the six new habits
- [x] Hand the user a zip of the project files — saved as guilt-trip-plant.zip in Files
- [x] Publish the app so anyone with a link can open it — live at https://sigh-cus.design (public visibility)
- [x] Rename the app to Sigh-cus everywhere — page title, heading, tracks page, README, and the address itself
- [x] Refresh the README on GitHub — done in both repos (KeertiUmadi and ShubhangiPurohit-dev): current timings, all ten habits with how each is confirmed fixed, 20 tests, voice-is-text-only note; verified by reading the copies back. Note: pushing straight to Keerti's repo triggered Lovable's "a repository push replaced your Lovable work" banner and rolled back one roadmap line — future README edits go through the project so they sync normally

- [x] Snooze: pause Gerald's comments for a while (keep counting)
- [x] Fix sip detection (chin-up sign was inverted) + manual "I just drank water" button
- [x] Claim a free domain via GoDaddy Registry (mlh.link/godaddyregistry) — claimed through Porkbun: sigh-cus.design is registered (no hosting plan picked; the hosting upsell screen was skipped on purpose)
- [x] Connect sigh-cus.design to the app — verified live: status active, set as primary, A record and proof text both ok
- [x] www.sigh-cus.design — verified live and active; it forwards to sigh-cus.design (the main address)
- [x] Make the camera preview show more of the room — the video now spans the full page width and requests a 1280x720 feed; verified in a test browser (1112x626 preview, picture live, layout below intact)
- [x] Republish so the wider camera preview reaches https://sigh-cus.design — published with the new habits
- [x] Six new habits (frown/squint, staring, leaning close, nail-biting, yawning, phone) with sarcastic "you fixed it" lines; faster timings (thirst 1 min, slouch/away/stare/close 10 s, frown/nails/yawn 5 s, phone 20 s)
- [x] Publish the new habits to https://sigh-cus.design — publishing requested for the public site
- [x] "Fine, I'll Speak" voice button — Gerald types until you press it, then speaks his lines with ElevenLabs and the button becomes "That's Enough, Gerald"; verified audio plays when on, no voice calls when off, and it is live on sigh-cus.design
- [x] Faster triggers + instant compliments — every habit except drinking now nags after 5 seconds (thirst stays 1 minute); fixing a habit earns a backhanded line immediately instead of waiting for the AI to write one
- [x] Sip rules tightened — a head tilt must hold 3 seconds and only counts after Gerald has nagged about water; the automatic checks pass (21), but this has not been tried on a real camera
- [x] Publish these to https://sigh-cus.design — publishing requested; the Lovable address is now https://sigh-cus.lovable.app
- [ ] Real-camera check of every habit — blocked: needs someone sitting in front of a webcam
- [ ] Screen time still 60 minutes — a 5-second limit would nag nonstop; waiting on the user's word
- [ ] Gerald's opening line still says "Slouch for two minutes" — the real rule is 5 seconds; waiting on the user's word
