import { render, screen } from '@testing-library/react-native';

import App from './App';
import { APP_NAME } from '@/shared/app-info';

// RNTL 14's `render` is async — it awaits React 19's concurrent render before
// queries can see the tree. Forgetting the await fails as "render function has
// not been called", which does not obviously point at the missing await.
describe('App', () => {
  it('renders the app name', async () => {
    await render(<App />);
    expect(screen.getByText(APP_NAME)).toBeTruthy();
  });

  it('resolves modules through the @/ alias', () => {
    expect(APP_NAME).toBe('Sovereign Edge');
  });
});
