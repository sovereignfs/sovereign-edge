import { useState } from 'react';
import {
  Button,
  ChatBubble,
  ListItem,
  TextField,
  Toggle,
  ThemeProvider,
  useTheme,
} from 'desktop-ui';

/**
 * Task 12.6's own scope: prove `desktop-ui`'s component set actually
 * renders, not build the real chat UI — that's task 12.7's job, once this
 * is wired up. Every component `desktop-ui` exports gets exercised here at
 * least once so there's something real to look at, not just a passing
 * typecheck.
 */
function ComponentGallery() {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(false);

  return (
    <div
      style={{
        background: theme.colors.surface,
        color: theme.colors.textPrimary,
        minHeight: '100vh',
        fontFamily: theme.fontFamily.body,
        padding: theme.space[6],
        display: 'flex',
        flexDirection: 'column',
        gap: theme.space[6],
      }}
    >
      <div>
        <h1 style={{ fontSize: theme.fontSize['2xl'], margin: 0 }}>
          Sovereign Edge
        </h1>
        <p
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}
        >
          Desktop component gallery — task 12.6. The real chat UI is task 12.7's
          job.
        </p>
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[3],
        }}
      >
        <h2 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Button</h2>
        <div style={{ display: 'flex', gap: theme.space[3], flexWrap: 'wrap' }}>
          <Button
            label="Primary"
            variant="primary"
            onClick={() => setLoading((l) => !l)}
          />
          <Button label="Secondary" variant="secondary" />
          <Button label="Ghost" variant="ghost" />
          <Button label="Danger" variant="danger" />
          <Button label="Loading" loading={loading} />
          <Button label="Disabled" disabled />
        </div>
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[3],
        }}
      >
        <h2 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>ChatBubble</h2>
        <div>
          <ChatBubble role="user" text="What's the weather in San Francisco?" />
          <ChatBubble
            role="assistant"
            text="Fetching current conditions…"
            streaming
            connector="Search"
          />
          <ChatBubble
            role="assistant"
            text="It's 62°F and foggy in San Francisco right now."
            connector="Search"
          />
        </div>
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[3],
        }}
      >
        <h2 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>TextField</h2>
        <div
          style={{
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.space[3],
          }}
        >
          <TextField
            label="Message"
            placeholder="Ask anything…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <TextField
            label="Instance URL"
            defaultValue="not-a-url"
            error="Enter a valid https:// URL."
          />
          <TextField
            label="API token"
            hint="Found in your instance's settings page."
          />
        </div>
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[1],
        }}
      >
        <h2
          style={{
            fontSize: theme.fontSize.lg,
            margin: 0,
            marginBottom: theme.space[2],
          }}
        >
          ListItem + Toggle
        </h2>
        <ListItem
          title="Notifications"
          subtitle="Get notified when a long reply finishes"
          accessory={
            <Toggle
              value={notifications}
              onValueChange={setNotifications}
              aria-label="Notifications"
            />
          }
        />
        <ListItem
          title="Connectors"
          subtitle="Nothing can reach the network"
          onClick={() => {}}
        />
        <ListItem
          title="Delete all conversations"
          destructive
          onClick={() => {}}
        />
        <ListItem title="Version" subtitle="0.0.0" />
      </section>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ComponentGallery />
    </ThemeProvider>
  );
}
