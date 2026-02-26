import type { BuiltinSkill } from "../types"

export const SCIENTIFIC_PRESENTATION_SKILL_NAME = "scientific-presentation"

export const SCIENTIFIC_PRESENTATION_SKILL_DESCRIPTION =
  "Scientific presentation design: conference talks, poster sessions, pitch decks for reviewers/investors, keynote structure, visual storytelling for technical audiences, demo preparation, slide design principles. Triggers: 'presentation', 'conference talk', 'poster', 'pitch deck', 'keynote', 'slides', 'demo'."

export const scientificPresentationSkill: BuiltinSkill = {
  name: SCIENTIFIC_PRESENTATION_SKILL_NAME,
  description: SCIENTIFIC_PRESENTATION_SKILL_DESCRIPTION,
  template: `# Scientific Presentation — Comprehensive Reference

## CONFERENCE TALK (15-25 min)

### Structure
| Section | Time (20 min talk) | Slides | Purpose |
|---------|-------------------|--------|---------|
| **Title + Hook** | 1 min | 1-2 | Grab attention, state the problem |
| **Background** | 2-3 min | 2-3 | Context the audience needs (NOT a literature review) |
| **Problem & Motivation** | 2 min | 1-2 | Why this matters, what's missing |
| **Approach** | 5-7 min | 4-6 | Your method — the core contribution |
| **Results** | 5-7 min | 4-6 | Key findings with visuals |
| **Demo** (optional) | 2-3 min | Live or video | Show it working |
| **Conclusion & Future Work** | 2 min | 1-2 | Takeaways, what's next |
| **Q&A** | 3-5 min | Backup slides | Anticipated questions |

### Slide Count Rule
- ~1 slide per minute (max)
- 20 min talk = 15-20 content slides + backup
- Dense slides need more time; visual slides can go faster

### Opening Strategies
| Strategy | Example |
|----------|---------|
| **Problem statement** | "Every day, X systems fail because..." |
| **Surprising fact** | "Did you know that Y accounts for Z%?" |
| **Question** | "What if we could achieve X without Y?" |
| **Real-world scenario** | "Imagine you're a [role] and you need to..." |
| **Demo teaser** | Show the end result first, then explain how |

### Closing Strategies
- Summarize contributions (numbered, matching the paper)
- Return to the opening hook (full circle)
- Clear "take-home message" — one sentence the audience remembers
- Future work: concrete next steps, not vague promises
- Acknowledgments: collaborators, funding, data providers

## SLIDE DESIGN PRINCIPLES

### Visual Hierarchy
- **One idea per slide** — if you need "and", split the slide
- **Title = takeaway**: not "Results" but "Our method achieves 15% improvement"
- **6×6 rule**: max 6 bullet points, max 6 words each (guideline, not law)
- **Minimize text**: if you're reading the slide aloud, there's too much text

### Color & Typography
| Element | Guideline |
|---------|-----------|
| **Font size** | Title: 28-36pt, body: 20-24pt, never below 18pt |
| **Font family** | Sans-serif for presentations (Helvetica, Arial, Calibri) |
| **Colors** | Max 3-4 colors; high contrast; colorblind-friendly palette |
| **Background** | White/light for well-lit rooms; dark for dim rooms |
| **Emphasis** | Bold or color, not underline or italic (hard to read at distance) |

### Figures & Charts
- Every figure must have a clear caption/title
- Label axes with units
- Use consistent color coding throughout the presentation
- Prefer: bar charts (comparison), line charts (trends), scatter plots (correlation)
- Avoid: pie charts (hard to compare), 3D effects (distortion), tables with >5 rows

### Animation Guidelines
- Use sparingly — only when revealing information sequentially adds clarity
- Build complex diagrams step by step
- Avoid: flying text, spinning transitions, sound effects
- Consistent animation style throughout

## POSTER PRESENTATION

### Poster Layout
\`\`\`
┌─────────────────────────────────────────────────┐
│                    TITLE                         │
│            Authors, Affiliations                 │
├───────────┬───────────────┬─────────────────────┤
│           │               │                     │
│ Background│   Method      │    Results          │
│ & Problem │   / Approach  │    / Findings       │
│           │               │                     │
├───────────┴───────────────┴─────────────────────┤
│  Conclusions    │    References    │  QR Code    │
└─────────────────┴─────────────────┴─────────────┘
\`\`\`

### Poster Design Rules
| Rule | Guideline |
|------|-----------|
| **Size** | Check venue requirements (typical: A0, 36"×48", 90×120cm) |
| **Readability** | Title readable from 3m, body from 1.5m |
| **Text density** | 800-1000 words MAX (including figure captions) |
| **Figures** | Dominate the poster — readers look at figures first |
| **Flow** | Column-based reading (left→right, top→bottom) |
| **White space** | 30-40% of poster should be empty |
| **QR code** | Link to paper, code repository, or project page |

### Poster Presentation Tips
- Prepare a 2-minute "elevator pitch" for walk-ups
- Have a longer 5-minute version for interested visitors
- Stand beside your poster, not in front of it
- Bring business cards or have QR code to your page
- Prepare for "So what?" — have the impact story ready

## PITCH DECK (for reviewers, investors, or stakeholders)

### Structure (10-12 slides)
| Slide | Content | Time |
|-------|---------|------|
| **1. Title** | Name, tagline, team | 30 sec |
| **2. Problem** | Pain point with evidence | 1 min |
| **3. Solution** | Your approach in one sentence | 1 min |
| **4. How It Works** | Architecture/demo/walkthrough | 2 min |
| **5. Validation** | Results, benchmarks, user feedback | 2 min |
| **6. Market / Impact** | Who benefits, scale of impact | 1 min |
| **7. Competitive Landscape** | 2×2 matrix positioning | 1 min |
| **8. Team** | Key people and their relevant expertise | 30 sec |
| **9. Roadmap** | Timeline of milestones | 30 sec |
| **10. Ask** | What you need (funding, partnership, feedback) | 30 sec |

### Pitch Tips
- Lead with the problem, not the technology
- Use specific numbers (not "many users" but "1,200 researchers in 45 institutions")
- Demo > screenshots > description
- Anticipate objections and address them preemptively
- End with a clear call to action

## DEMO PREPARATION

### Demo Checklist
- [ ] Rehearse 3+ times with the exact setup
- [ ] Have a recorded backup video (in case of technical failure)
- [ ] Pre-load all data, pre-open all windows
- [ ] Disable notifications, updates, screen savers
- [ ] Test with venue projector/screen resolution
- [ ] Keep demo under 3 minutes (shorter = tighter)
- [ ] Narrate what you're doing and why (audience can't read your screen)
- [ ] Prepare graceful recovery for common failure modes

### Live vs. Recorded Demo
| Factor | Live | Recorded |
|--------|------|----------|
| **Credibility** | Higher (it's real) | Lower (could be cherry-picked) |
| **Risk** | Network, bugs, timing | None |
| **Engagement** | Higher (interactive) | Consistent pacing |
| **Best practice** | Primary + recorded backup | When reliability is critical |

## DELIVERY TECHNIQUES

### Speaking
- Speak to the audience, not the screen
- 120-150 words per minute (conversational pace)
- Pause after key points (let the audience absorb)
- Vary tone and pace — monotone loses attention
- Use "we" for collaborative work, "I" for your specific contributions

### Handling Q&A
- Repeat the question for the audience
- "That's a great question" is filler — just answer
- If you don't know: "I haven't investigated that yet, but my intuition is..."
- If hostile: acknowledge the concern, redirect to data
- Have 3-5 backup slides for anticipated deep-dive questions

### Rehearsal Protocol
1. **Solo run-through**: timing, flow, transitions
2. **Practice talk**: present to lab/colleagues, get feedback
3. **Dry run**: with actual equipment at venue (if possible)
4. **Record yourself**: watch for filler words, pacing, eye contact`,
}
