//! The Calendar connector's manifests (task 10.2), mirroring
//! `apps/mobile/src/connectors/calendar/manifest.ts` — same four tools,
//! same ids, same capability-doubles-as-permission-scope shape (see that
//! file's own doc comment for why: the validator's cross-field rule
//! requires `handler.capability` to be a member of
//! `permissions.device.capabilities`). `platforms: ["desktop"]`, not
//! `["ios", "android"]` — desktop's own manifest, not a shared one, since
//! `known_connector_manifests()` in `lib.rs` only offers these on macOS.

use crate::connectors::manifest::{
    ConnectorManifest, ConnectorManifestTier3, DevicePermissions, NativeHandlerRef, Platform,
    Pricing, Tier3Permissions, ToolDefinition, ToolParameters,
};
use serde_json::json;

const ID_PREFIX: &str = "fs.sovereign.calendar";

fn tool(
    name: &str,
    description: &str,
    properties: serde_json::Value,
    required: &[&str],
) -> ToolDefinition {
    let serde_json::Value::Object(properties) = properties else {
        unreachable!("caller always passes a JSON object");
    };
    ToolDefinition {
        name: name.to_string(),
        description: description.to_string(),
        parameters: ToolParameters {
            type_: "object".to_string(),
            properties,
            required: if required.is_empty() {
                None
            } else {
                Some(required.iter().map(|s| s.to_string()).collect())
            },
            extra: serde_json::Map::new(),
        },
    }
}

fn manifest(
    id_suffix: &str,
    name: &str,
    summary: &str,
    tool: ToolDefinition,
    capability: &str,
) -> ConnectorManifest {
    ConnectorManifest::Tier3(ConnectorManifestTier3 {
        manifest_version: 1,
        id: format!("{ID_PREFIX}.{id_suffix}"),
        name: name.to_string(),
        version: "1.0.0".to_string(),
        summary: summary.to_string(),
        tier: 3,
        platforms: vec![Platform::Desktop],
        tool,
        pricing: Pricing::Free,
        permissions: Tier3Permissions {
            device: DevicePermissions {
                capabilities: vec![capability.to_string()],
            },
        },
        handler: NativeHandlerRef {
            capability: capability.to_string(),
        },
    })
}

pub fn calendar_manifests() -> Vec<ConnectorManifest> {
    vec![
        manifest(
            "create-event",
            "Calendar — Create Event",
            "Creates an event on your device calendar.",
            tool(
                "calendar_create_event",
                "Creates a new event on the device calendar.",
                json!({
                    "title": { "type": "string", "description": "The event title." },
                    "startDate": { "type": "string", "description": "When the event starts, as an ISO 8601 date-time." },
                    "endDate": { "type": "string", "description": "When the event ends, as an ISO 8601 date-time." },
                    "notes": { "type": "string", "description": "Optional event notes." },
                    "alertMinutesBefore": { "type": "number", "description": "Minutes before the event to show a reminder. Omit for no reminder." },
                }),
                &["title", "startDate", "endDate"],
            ),
            "calendar.event.create",
        ),
        manifest(
            "update-event",
            "Calendar — Update Event",
            "Updates an existing event on your device calendar.",
            tool(
                "calendar_update_event",
                "Updates an event previously created or found on the device calendar.",
                json!({
                    "eventId": { "type": "string", "description": "The event id returned by a prior create or query call." },
                    "title": { "type": "string", "description": "The new event title." },
                    "startDate": { "type": "string", "description": "The new start time, as an ISO 8601 date-time." },
                    "endDate": { "type": "string", "description": "The new end time, as an ISO 8601 date-time." },
                    "notes": { "type": "string", "description": "The new event notes." },
                    "alertMinutesBefore": { "type": "number", "description": "Minutes before the event to show a reminder. Omit for no reminder." },
                }),
                &["eventId"],
            ),
            "calendar.event.update",
        ),
        manifest(
            "delete-event",
            "Calendar — Delete Event",
            "Deletes an event from your device calendar.",
            tool(
                "calendar_delete_event",
                "Deletes an event from the device calendar.",
                json!({
                    "eventId": { "type": "string", "description": "The event id returned by a prior create or query call." },
                }),
                &["eventId"],
            ),
            "calendar.event.delete",
        ),
        manifest(
            "query-events",
            "Calendar — Query Events",
            "Reads events from your device calendar.",
            tool(
                "calendar_query_events",
                "Lists events on the device calendar within a date range.",
                json!({
                    "startDate": { "type": "string", "description": "When the event starts, as an ISO 8601 date-time." },
                    "endDate": { "type": "string", "description": "When the event ends, as an ISO 8601 date-time." },
                }),
                &["startDate", "endDate"],
            ),
            "calendar.event.query",
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::validate_manifest;

    #[test]
    fn has_exactly_four_manifests() {
        assert_eq!(calendar_manifests().len(), 4);
    }

    #[test]
    fn every_manifest_validates_against_the_real_validator() {
        for manifest in calendar_manifests() {
            let json = manifest.to_json();
            match validate_manifest(&json) {
                crate::connectors::manifest::ValidationResult::Valid(_) => {}
                crate::connectors::manifest::ValidationResult::Invalid(issues) => {
                    panic!("manifest failed to validate: {issues:?}");
                }
            }
        }
    }

    #[test]
    fn every_manifest_has_a_distinct_id() {
        let ids: std::collections::HashSet<_> = calendar_manifests()
            .iter()
            .map(|m| m.id().to_string())
            .collect();
        assert_eq!(ids.len(), 4);
    }

    #[test]
    fn every_manifest_declares_itself_desktop_only() {
        for manifest in calendar_manifests() {
            assert_eq!(manifest.platforms(), &[Platform::Desktop]);
        }
    }
}
