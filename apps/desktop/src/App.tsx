import { ThemeProvider } from 'desktop-ui';
import { ChatScreen } from './chat/ChatScreen';

export function App() {
  return (
    <ThemeProvider>
      <ChatScreen />
    </ThemeProvider>
  );
}
