# Research index

Status at a glance for all Sovereign Edge research notes. Open the individual
file for full findings, sources, and open questions.

## What a research doc is

A research doc captures an open-ended technical or strategic question that
doesn't yet have a concrete, committed design: findings, options considered,
and a recommendation — lighter than a formal design doc, and not deleted once
decided. It's the working record of *why*, kept even after the decision is
folded into [CONCEPT.md](../../CONCEPT.md), [docs/epics/](../epics/), and
[ROADMAP.md](../../ROADMAP.md).

Not every research doc needs to conclude with a definitive design — "not now"
or "rejected" is a valid, useful outcome to record.

Each doc carries its metadata (status, scope, date, summary) as YAML
frontmatter rather than a bold-label header block — `scope` here is the
platform axis (mobile/desktop/shared), distinct from the `summary` field's
description of the actual subject matter. Unlike epics, a research doc's
scope is mostly permanent: it describes what the *question* concerns (RN
toolchain choice, phone hardware) more often than where code currently lives,
so don't expect these to migrate the way an epic's scope can.

| Doc                                                | Title                                                                     | Status                    | Scope   |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- | ------- |
| [0001](0001-concept-and-connector-architecture.md) | Sovereign Edge: concept, positioning, and connector architecture           | Decided                    | Shared  |
| [0002](0002-react-native-framework-choice.md)      | React Native framework choice: Expo vs. Community CLI                      | Decided                    | Mobile  |
| [0003](0003-model-verification-hashing.md)         | Model download verification: why MD5, not SHA-256                         | Superseded in part         | Mobile  |
| [0004](0004-connector-manifest-schema.md)          | Connector manifest schema: format, validation, and the templating surface | Decided                    | Shared  |
| [0005](0005-calendar-connector.md)                 | Calendar connector: scope and platform fit                                | Decided                    | Mobile  |
| [0006](0006-files-document-summarization.md)       | Files/document summarization: connector or chat feature?                  | Decided (architecture)     | Shared  |
| [0007](0007-text-to-speech.md)                     | Text-to-speech: chat feature, not a connector                             | Decided                    | Shared  |
| [0008](0008-health-step-count.md)                  | Health connector: why "step count" isn't HealthKit                        | Decided (redefine scope)   | Mobile  |
| [0009](0009-device-connector.md)                   | Device connector: what's actually left after alarms drop out              | Decided                    | Mobile  |
