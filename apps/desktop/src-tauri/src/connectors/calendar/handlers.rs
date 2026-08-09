//! The Calendar connector's native handlers (task 10.2), mirroring
//! `apps/mobile/src/connectors/calendar/handlers.ts` — real EventKit calls
//! via `objc2-event-kit`, not a shell-out or a higher-level wrapper crate.
//!
//! By the time a call reaches these functions, permission is already a
//! decided, persisted fact — `is_allowed()` gates dispatch before this
//! module is ever reached (same as every other Tier 3 handler), and the
//! one-time OS permission *request* lives entirely in `access.rs`, not
//! here. That's what lets these stay plain synchronous functions matching
//! `runtime::NativeHandler`'s `fn(...) -> Result<String, String>` shape —
//! EventKit's CRUD/query methods are genuinely synchronous Objective-C
//! calls once authorization is already granted; only the one-time
//! permission *request* needs a completion-handler bridge (`access.rs`).

use crate::connectors::runtime::NativeHandler;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_event_kit::{EKAlarm, EKCalendar, EKEvent, EKEventStore, EKSpan};
use objc2_foundation::{NSArray, NSDate, NSString};

fn event_store() -> Retained<EKEventStore> {
    // A fresh store per call, not a held singleton: Apple's own docs call a
    // long-lived instance a *performance* recommendation ("most likely a
    // singleton"), not a correctness requirement — each instance reads the
    // same underlying calendar database independently. A `Retained<T>`
    // Objective-C object also isn't safely shareable across this app's
    // multi-threaded Tauri command dispatch without its own synchronization,
    // which a fresh instance per call sidesteps entirely.
    unsafe { EKEventStore::init(EKEventStore::alloc()) }
}

fn nsstring(s: &str) -> Retained<NSString> {
    NSString::from_str(s)
}

fn string_arg<'a>(
    args: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str())
}

/// Parses `YYYY-MM-DDTHH:MM:SS[.sss]Z` (UTC only — the MVP scope this
/// connector and its mobile counterpart both share is explicitly
/// timezone-naive) into seconds since the Unix epoch, for
/// `NSDate::dateWithTimeIntervalSince1970`. No date/time crate dependency
/// for this one format, mirroring `permissions/grants.rs`'s own `iso_now`
/// precedent — `days_from_civil` below is the documented inverse of that
/// function's `civil_from_days`, both Howard Hinnant's public domain
/// algorithm (http://howardhinnant.github.io/date_algorithms.html).
fn parse_iso8601_utc(s: &str) -> Option<f64> {
    if s.len() < 20 || !s.ends_with('Z') {
        return None;
    }
    let bytes = s.as_bytes();
    if bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
    {
        return None;
    }
    let y: i64 = s.get(0..4)?.parse().ok()?;
    let mo: u32 = s.get(5..7)?.parse().ok()?;
    let d: u32 = s.get(8..10)?.parse().ok()?;
    let h: i64 = s.get(11..13)?.parse().ok()?;
    let mi: i64 = s.get(14..16)?.parse().ok()?;
    let se: i64 = s.get(17..19)?.parse().ok()?;
    let days = days_from_civil(y, mo, d);
    Some((days * 86_400 + h * 3600 + mi * 60 + se) as f64)
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = ((m as i64 + 9) % 12) as u64;
    let doy = (153 * mp + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

fn iso8601_utc(secs: f64) -> String {
    let secs_i = secs.floor() as i64;
    let days = secs_i.div_euclid(86_400);
    let time_of_day = secs_i.rem_euclid(86_400);
    let (h, m, s) = (
        time_of_day / 3600,
        (time_of_day / 60) % 60,
        time_of_day % 60,
    );
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn default_calendar(store: &EKEventStore) -> Result<Retained<EKCalendar>, String> {
    unsafe { store.defaultCalendarForNewEvents() }
        .ok_or_else(|| "No default calendar found on this device.".to_string())
}

pub fn create_event(args: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    let title = string_arg(args, "title");
    let start = string_arg(args, "startDate").and_then(parse_iso8601_utc);
    let end = string_arg(args, "endDate").and_then(parse_iso8601_utc);
    let (Some(title), Some(start), Some(end)) = (title, start, end) else {
        return Err("title, startDate, and endDate are required.".to_string());
    };

    let store = event_store();
    let calendar = default_calendar(&store)?;
    let event = unsafe { EKEvent::eventWithEventStore(&store) };
    unsafe {
        event.setTitle(Some(&nsstring(title)));
        event.setStartDate(Some(&NSDate::dateWithTimeIntervalSince1970(start)));
        event.setEndDate(Some(&NSDate::dateWithTimeIntervalSince1970(end)));
        if let Some(notes) = string_arg(args, "notes") {
            event.setNotes(Some(&nsstring(notes)));
        }
        if let Some(minutes) = args.get("alertMinutesBefore").and_then(|v| v.as_f64()) {
            let alarm = EKAlarm::alarmWithRelativeOffset(-minutes * 60.0);
            event.setAlarms(Some(&NSArray::from_retained_slice(&[alarm])));
        }
        event.setCalendar(Some(&calendar));
        store
            .saveEvent_span_error(&event, EKSpan::ThisEvent)
            .map_err(|error| error.localizedDescription().to_string())?;
    }

    let id = unsafe { event.eventIdentifier() }
        .map(|s| s.to_string())
        .unwrap_or_default();
    Ok(format!("Created event \"{title}\" (id: {id})."))
}

pub fn update_event(args: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    let Some(event_id) = string_arg(args, "eventId") else {
        return Err("eventId is required.".to_string());
    };

    let store = event_store();
    let Some(event) = (unsafe { store.eventWithIdentifier(&nsstring(event_id)) }) else {
        return Err(format!("No event found with id {event_id}."));
    };

    unsafe {
        if let Some(title) = string_arg(args, "title") {
            event.setTitle(Some(&nsstring(title)));
        }
        if let Some(start) = string_arg(args, "startDate").and_then(parse_iso8601_utc) {
            event.setStartDate(Some(&NSDate::dateWithTimeIntervalSince1970(start)));
        }
        if let Some(end) = string_arg(args, "endDate").and_then(parse_iso8601_utc) {
            event.setEndDate(Some(&NSDate::dateWithTimeIntervalSince1970(end)));
        }
        if let Some(notes) = string_arg(args, "notes") {
            event.setNotes(Some(&nsstring(notes)));
        }
        if let Some(minutes) = args.get("alertMinutesBefore").and_then(|v| v.as_f64()) {
            let alarm = EKAlarm::alarmWithRelativeOffset(-minutes * 60.0);
            event.setAlarms(Some(&NSArray::from_retained_slice(&[alarm])));
        }
        store
            .saveEvent_span_error(&event, EKSpan::ThisEvent)
            .map_err(|error| error.localizedDescription().to_string())?;
    }

    Ok(format!("Updated event {event_id}."))
}

pub fn delete_event(args: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    let Some(event_id) = string_arg(args, "eventId") else {
        return Err("eventId is required.".to_string());
    };

    let store = event_store();
    let Some(event) = (unsafe { store.eventWithIdentifier(&nsstring(event_id)) }) else {
        return Err(format!("No event found with id {event_id}."));
    };

    unsafe {
        store
            .removeEvent_span_error(&event, EKSpan::ThisEvent)
            .map_err(|error| error.localizedDescription().to_string())?;
    }

    Ok(format!("Deleted event {event_id}."))
}

pub fn query_events(args: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    let start = string_arg(args, "startDate").and_then(parse_iso8601_utc);
    let end = string_arg(args, "endDate").and_then(parse_iso8601_utc);
    let (Some(start), Some(end)) = (start, end) else {
        return Err("startDate and endDate are required.".to_string());
    };

    let store = event_store();
    let events = unsafe {
        // `calendars: None` searches every calendar the app can read, not
        // just the default one — mirrors mobile's own "what's on my
        // calendar means the whole device" choice (research 0005).
        let predicate = store.predicateForEventsWithStartDate_endDate_calendars(
            &NSDate::dateWithTimeIntervalSince1970(start),
            &NSDate::dateWithTimeIntervalSince1970(end),
            None,
        );
        store.eventsMatchingPredicate(&predicate)
    };

    if events.is_empty() {
        return Ok("No events found in that range.".to_string());
    }

    let lines: Vec<String> = events
        .iter()
        .map(|event| unsafe {
            let title = event.title().to_string();
            let id = event
                .eventIdentifier()
                .map(|s| s.to_string())
                .unwrap_or_default();
            let start = iso8601_utc(event.startDate().timeIntervalSince1970());
            let end = iso8601_utc(event.endDate().timeIntervalSince1970());
            format!("{title} (id: {id}): {start} – {end}")
        })
        .collect();
    Ok(lines.join("\n"))
}

pub fn native_handler_for(capability: &str) -> Option<NativeHandler> {
    match capability {
        "calendar.event.create" => Some(create_event),
        "calendar.event.update" => Some(update_event),
        "calendar.event.delete" => Some(delete_event),
        "calendar.event.query" => Some(query_events),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_real_iso8601_utc_timestamp() {
        // 2026-08-10T09:00:00Z, checked against a known Unix timestamp.
        let secs = parse_iso8601_utc("2026-08-10T09:00:00Z").unwrap();
        assert_eq!(secs as i64, 1_786_352_400);
    }

    #[test]
    fn rejects_a_non_utc_or_malformed_timestamp() {
        assert!(parse_iso8601_utc("2026-08-10T09:00:00+02:00").is_none());
        assert!(parse_iso8601_utc("not a date").is_none());
    }

    #[test]
    fn iso8601_utc_round_trips_parse_iso8601_utc() {
        let secs = parse_iso8601_utc("2026-08-10T09:00:00Z").unwrap();
        assert_eq!(iso8601_utc(secs), "2026-08-10T09:00:00Z");
    }

    #[test]
    fn create_event_refuses_without_required_fields() {
        let args = serde_json::Map::new();
        let result = create_event(&args);
        assert_eq!(
            result,
            Err("title, startDate, and endDate are required.".to_string())
        );
    }

    #[test]
    fn update_event_refuses_without_event_id() {
        let args = serde_json::Map::new();
        let result = update_event(&args);
        assert_eq!(result, Err("eventId is required.".to_string()));
    }

    #[test]
    fn delete_event_refuses_without_event_id() {
        let args = serde_json::Map::new();
        let result = delete_event(&args);
        assert_eq!(result, Err("eventId is required.".to_string()));
    }

    #[test]
    fn query_events_refuses_without_a_date_range() {
        let args = serde_json::Map::new();
        let result = query_events(&args);
        assert_eq!(
            result,
            Err("startDate and endDate are required.".to_string())
        );
    }

    #[test]
    fn native_handler_for_resolves_all_four_capabilities() {
        assert!(native_handler_for("calendar.event.create").is_some());
        assert!(native_handler_for("calendar.event.update").is_some());
        assert!(native_handler_for("calendar.event.delete").is_some());
        assert!(native_handler_for("calendar.event.query").is_some());
        assert!(native_handler_for("calendar.event.unknown").is_none());
    }
}
