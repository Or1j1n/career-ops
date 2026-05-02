# Customization Guide

## Profile (config/profile.yml)

This is the single source of truth for your identity. All modes read from here.

Key sections:
- **candidate**: Name, email, phone, location, LinkedIn, portfolio
- **target_roles**: Your North Star roles and archetypes
- **narrative**: Your headline, exit story, superpowers, proof points
- **compensation**: Target range, minimum, currency
- **location**: Country, timezone, visa status, on-site availability
- **language**: Optional language policy. For example, keep analysis in French while generating CVs and application answers in the job posting language.

## Target Roles (modes/_profile.md)

The archetype table in `_profile.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **location_filter**: Geography rules used by `scan.mjs`; keep this strict if you only want one market
4. **search_queries**: WebSearch queries for job boards (used by the agent flow, not by the zero-token script)
5. **tracked_companies**: Companies to check directly. Use `scan_method: playwright_generic` or `scan_method: playwright_custom` + `scan_adapter` for pages that do not expose an ATS API.

Vous pouvez aussi ajouter un `title_filter` propre a une entreprise sous une entree `tracked_companies`. Ses mots-cles `positive` et `negative` sont fusionnes avec le filtre global. C'est utile pour des intitules pertinents chez une entreprise precise, mais trop larges pour tout le scan:

```yaml
- name: Example Cloud
  careers_url: https://example.com/careers
  title_filter:
    positive:
      - "AI Consultant"
      - "AI Engineer"
```

## CV Template (templates/cv-template.html)

The HTML template uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

To customize fonts/colors, edit the CSS in the template. Update font files in `fonts/` if switching fonts.

## Negotiation Scripts and Personal Rules (modes/_profile.md)

Keep user-specific negotiation rules, language policy, archetypes, and writing style in `modes/_profile.md`. Do not put personal preferences in `modes/_shared.md`; that file belongs to the auto-updated system layer.

Useful profile-level rules include:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses
- Candidate-facing language rules
- Market-specific checks such as CDI/SYNTEC/RTT/13e mois for France-based roles

## Hooks (Optional)

Career-ops can integrate with external systems via Claude Code hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Career-ops session started'"
      }]
    }]
  }
}
```

Save hooks in `.claude/settings.json`.

## States (templates/states.yml)

The canonical states rarely need changing. If you add new states, update:
1. `templates/states.yml`
2. `normalize-statuses.mjs` (alias mappings)
3. Dashboard/data readers that group or display statuses
4. `modes/_shared.md` only for system-level references
