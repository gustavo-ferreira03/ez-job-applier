---
name: EZJobApplier Frontend
description: Focused dark control room for automated job-application workflows.
colors:
  surface-base: '#0d0d0f'
  surface-raised: '#111113'
  surface-overlay: '#18181b'
  surface-sidebar: '#0a0a0c'
  surface-hover: '#1c1c20'
  border-subtle: '#1c1c20'
  border-default: '#27272a'
  border-strong: '#3f3f46'
  text-primary: '#f1f5f9'
  text-secondary: '#cbd5e1'
  text-muted: '#94a3b8'
  text-faint: '#8492a6'
  accent: '#38bdf8'
  accent-hover: '#0ea5e9'
  accent-text: '#04243a'
  warning-bg: '#2d2508'
  warning-text: '#fbbf24'
  success-bg: '#052e16'
  success-text: '#4ade80'
  danger-bg: '#1c0a0a'
  danger-text: '#f87171'
  review-bg: '#0c2540'
  tag-linkedin-bg: '#182a4d'
  tag-linkedin-text: '#7aa2f7'
  tag-external-bg: '#2a1f4d'
  tag-external-text: '#c4a7f5'
  syntax-key: '#7aa2f7'
  syntax-string: '#9ece6a'
  syntax-number: '#e0af68'
  syntax-comment: '#5c6370'
  syntax-punct: '#8492a6'
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: '16px'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 'normal'
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 'normal'
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 'normal'
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 'normal'
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-text}'
    rounded: '{rounded.md}'
    padding: '8px 10px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
    textColor: '{colors.accent-text}'
    rounded: '{rounded.md}'
  button-quiet:
    backgroundColor: '{colors.surface-overlay}'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.md}'
    padding: '8px 10px'
  input-default:
    backgroundColor: '{colors.surface-overlay}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.md}'
    height: '32px'
  card-default:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.md}'
    padding: '10px'
  status-badge:
    backgroundColor: '{colors.surface-hover}'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.sm}'
    padding: '2px 6px'
---

# Design System: EZJobApplier Frontend

## 1. Overview

**Creative North Star: "Control Room"**

EZJobApplier is a compact operational interface for a personal workflow with real consequences. The system should feel focused, sharp, and calm: a dark workspace where job status, execution state, and user decisions are easier to scan than the surrounding chrome.

The visual system is flat, layered, and restrained. It uses near-black surfaces, subtle zinc borders, a single sky-blue action color, and compact system typography. The interface rejects generic SaaS-dashboard gloss, decorative gradients, oversized hero metrics, visual noise, soft novelty illustrations, and bright motivational styling that competes with the job data.

**Key Characteristics:**

- Dense but readable product layout.
- One accent color reserved for primary action, focus, selection, and live execution state.
- State-rich badges and controls with strong contrast.
- Flat surfaces separated by tonal layering and thin borders, not ornamental shadows.
- Clear labels and consequence-oriented copy for automation, rejection, review, and submission.

## 2. Colors

The palette is a restrained dark neutral system with one sky-blue command accent and explicit semantic colors for job states.

### Primary

- **Command Sky**: The primary action and focus color. Use it for start execution, selected controls, processing borders, and keyboard focus. Its rarity is what makes it useful.
- **Command Sky Hover**: The active hover state for primary buttons and high-confidence command actions.
- **Command Ink**: Text placed on Command Sky for primary buttons.

### Secondary

- **Review Blue Field**: Used for review and execution-adjacent state surfaces.
- **Warning Amber Field**: Used for login-needed, unanswered questions, paused execution, and other required-input states.
- **Submitted Green Field**: Used for submitted, configured, success, and completion states.
- **Danger Red Field**: Used for failures, destructive actions, and removal affordances.

### Neutral

- **Base Black**: App background and main work surface.
- **Sidebar Black**: Navigation rail background, slightly deeper than Base Black.
- **Raised Panel**: Cards, rows, and contained controls at rest.
- **Overlay Panel**: Inputs, active tabs, menus, and toolbar controls.
- **Hover Panel**: Hover and selected-neutral fills.
- **Subtle Border**: Default low-contrast dividers and card edges.
- **Default Border**: Interactive component borders and selected inset strokes.
- **Strong Border**: Focus-adjacent control borders, scrollbars, and stronger separation.
- **Primary Text**: Titles, job names, and primary data.
- **Secondary Text**: Labels and supporting data that still need strong readability.
- **Muted Text**: Metadata, icons, and inactive navigation.
- **Faint Text**: Helper text and placeholder text. It must remain WCAG AA against overlay surfaces.

### Named Rules

**The One Accent Rule.** Command Sky is reserved for primary action, focus, selection, and active processing. Do not use it as decoration.

**The State Vocabulary Rule.** Status colors are semantic, not ornamental. Each status color belongs to a specific job or automation state and should not be repurposed for layout flourish.

## 3. Typography

**Display Font:** ui-sans-serif system stack.
**Body Font:** ui-sans-serif system stack.
**Label/Mono Font:** No separate label or mono face is currently used.

**Character:** Typography is compact, neutral, and interface-first. The system uses weight, size, and color to clarify hierarchy rather than display fonts or decorative letter spacing.

### Hierarchy

- **Display**: Not used. Product UI should not introduce large fluid display headings.
- **Headline** (600, 16px, 1.25): Top-level view titles such as Settings, Pipeline, Table, and Execution history.
- **Title** (600, 13-14px, 1.3): Section headings, job titles, and important row labels.
- **Body** (400, 12-13px, 1.45): Metadata, descriptions, helper text, and table content.
- **Label** (500-600, 10-12px, normal tracking unless existing table headers require uppercase): Form labels, table headers, badges, and compact controls.

### Named Rules

**The Interface Type Rule.** Use one system sans family. Do not add display fonts, decorative pairings, or fluid hero typography to authenticated product surfaces.

**The No Extra Description Rule.** Descriptions belong where they clarify consequences or required setup. Do not add explanatory copy to every tab, header, or control group.

## 4. Elevation

The system is flat by default. Depth is conveyed through tonal layering, borders, and overlay position. Shadows are reserved for drawers, modals, menus, and toasts where the surface must visibly float above the workspace.

### Shadow Vocabulary

- **Drawer Shadow**: A heavy side shadow for right-side drawers that cover content.
- **Modal Shadow**: A deep overlay shadow for modals and floating menus.

### Named Rules

**The Flat-By-Default Rule.** Cards, inputs, toolbars, and rows use borders plus surface tone. Do not add broad soft shadows to resting components.

**The Overlay Shadow Rule.** Shadows mean the surface is floating above the app. If the surface is part of the layout, it should not cast a shadow.

## 5. Components

### Buttons

- **Shape:** Compact rounded rectangles (6px radius), with full-pill reserved for counters and badges.
- **Primary:** Command Sky background, Command Ink text, 13px semibold label, 8px vertical padding.
- **Hover / Focus:** Primary hover shifts to Command Sky Hover. Focus always uses a 2px Command Sky outline with 2px offset.
- **Secondary / Quiet:** Surface Overlay or semantic state backgrounds with muted text. Use border and tone changes for hover, not decorative glow.

### Chips

- **Style:** Small rounded tags, 4px radius, Surface Hover background, Muted Text foreground.
- **State:** Status badges use semantic backgrounds and text. Skill chips remain neutral so they do not compete with job state.
- **Tag chips:** Source/route tags (LinkedIn, External) use their own low-saturation tinted fills, distinct per source and decoupled from both the Command Sky accent and the status vocabulary. They carry calm color identity without claiming an action or state meaning. In the board tag filter, the same identity reads as a small colored dot, while selection stays on the neutral active treatment used by nav and tabs.

### Cards / Containers

- **Corner Style:** 6-8px radius.
- **Background:** Raised Panel for cards, Overlay Panel for selected tabs and input-like controls.
- **Shadow Strategy:** Flat at rest. Use borders and surface color for hierarchy.
- **Border:** Subtle Border at rest, Default Border on hover or selected-neutral state.
- **Internal Padding:** 8-16px depending on density. Kanban cards use compact 10px padding.

### Inputs / Fields

- **Style:** Overlay Panel background, Default Border, 6px radius, 12px text, 32px default height.
- **Focus:** Border strengthens and the global 2px Command Sky focus outline appears.
- **Error / Disabled:** Error states should use Danger Red Field and Danger Red text. Disabled controls should reduce contrast through opacity only when the label remains readable.

### Navigation

- **Style:** Sidebar uses Sidebar Black, compact 14px labels, 15px line icons, and neutral inactive states.
- **Active:** Active page uses Overlay Panel and Primary Text, not the primary accent fill.
- **Mobile Treatment:** Sidebar becomes a top strip with horizontally scrollable nav before returning to a fixed left rail on desktop.

### Kanban Job Card

Kanban cards are dense decision objects. The title and company must scan first, skills stay neutral, unresolved questions use warning chips, and processing state uses a Command Sky border with reduced-motion support.

### Settings Tabs

Settings tabs are compact, label-only segmented controls. Active state uses a neutral filled surface with an inset border. Do not add descriptions inside tabs.

## 6. Do's and Don'ts

### Do:

- **Do** reserve Command Sky for execution, focus, selection, and active processing.
- **Do** keep body, helper, and placeholder text at WCAG AA contrast against the surfaces they sit on.
- **Do** use neutral active states for navigation and settings tabs unless the action is primary or state-critical.
- **Do** express automation status with both text and color where practical.
- **Do** use compact 4-8px radii for product surfaces and controls.
- **Do** keep empty states specific: say where jobs, executions, resumes, or actions will appear next.

### Don't:

- **Don't** use generic SaaS-dashboard gloss.
- **Don't** use decorative gradients, gradient text, glass cards, soft novelty illustrations, or oversized hero-style metrics.
- **Don't** add visual noise or bright motivational styling that competes with job data or execution state.
- **Don't** add descriptions to every tab, section header, or control when the label is already sufficient.
- **Don't** pair a decorative wide shadow with a 1px border on resting cards or buttons.
- **Don't** use side-stripe borders as card accents.
- **Don't** introduce display fonts, theatrical copy, or marketing-page hierarchy into authenticated app UI.
