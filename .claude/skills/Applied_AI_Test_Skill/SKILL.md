---
name: Applied_AI_Test_Skill
description: Summarize new PowerPoint decks saved in the Training folder (C:\Users\chand\OneDrive\Desktop\claude\Training). Use when a new PPT/PPTX is stored in that folder, or when the user asks to summarize new or unsummarized training slides.
---

# Applied_AI_Test_Skill

Creates a written summary of every new PowerPoint file in the Training folder.

**Watched folder:** `C:\Users\chand\OneDrive\Desktop\claude\Training`

## When to use

- A new `.pptx` (or `.ppt`) file has been saved to the Training folder.
- The user asks to "summarize the new PPT", "summarize training slides", or similar.

## Steps

1. **Find new decks.** Run the helper from the repository root:

   ```bash
   python .claude/skills/Applied_AI_Test_Skill/scripts/find_new_ppts.py "C:\Users\chand\OneDrive\Desktop\claude\Training"
   ```

   It prints every deck that has no matching summary file yet. A deck is
   "new" when `Summaries/<deck name>_summary.md` does not exist inside the
   Training folder. If nothing is printed, tell the user there are no new
   decks and stop.

2. **Extract the content** of each new deck:

   ```bash
   python .claude/skills/Applied_AI_Test_Skill/scripts/find_new_ppts.py "C:\Users\chand\OneDrive\Desktop\claude\Training" --extract "<path to deck>"
   ```

   This prints each slide's title, body text, tables and speaker notes.
   It needs `python-pptx` (`pip install python-pptx`). Legacy `.ppt` files
   must first be saved as `.pptx` in PowerPoint; tell the user if one is found.

3. **Write the summary** to
   `C:\Users\chand\OneDrive\Desktop\claude\Training\Summaries\<deck name>_summary.md`
   (create the `Summaries` folder if needed) using this template:

   ```markdown
   # Summary: <deck title>

   - **Source file:** <file name>
   - **Slides:** <count>
   - **Summarized on:** <YYYY-MM-DD>

   ## Overview
   2–4 sentences on what the deck is about and who it is for.

   ## Key points
   - 5–10 bullets with the most important ideas, in the order presented.

   ## Slide-by-slide
   1. **<slide title>** — one line on what the slide covers.

   ## Takeaways / action items
   - Concrete things the reader should remember or do.

   ## Terms to know
   - **Term** — short definition (only if the deck introduces jargon).
   ```

4. **Report back** to the user: list each deck summarized, the summary file
   path, and the 3 most important takeaways.

## Rules

- Summarize only what is in the deck (text, tables, notes). Do not invent
  facts; if a slide is image-only, say "image/diagram slide — no text".
- Never modify or move the original PPT files.
- Keep each summary under about 600 words.

## Automatic mode (folder watcher)

`scripts/watch_training.ps1` watches the Training folder on Windows and runs
`claude -p` with this skill whenever a new deck is saved. It waits until the
file has finished saving, skips decks that already have a summary, and logs to
`Training\Summaries\watcher.log`. A failed deck is not retried until it is
saved again.

Install once (starts now and at every sign-in), from PowerShell in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .claude\skills\Applied_AI_Test_Skill\scripts\install_watcher.ps1
```

Remove it with the same command plus `-Uninstall`. Requires the `claude`
command on PATH (signed in) and `python-pptx`.

When run by the watcher, nobody is there to answer questions: do not ask the
user anything, just write the summary file (or explain the problem in your
final message, which goes to the log).
