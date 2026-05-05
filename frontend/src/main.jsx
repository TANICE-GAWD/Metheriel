import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App';
import './assets/global.css';

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'sm',
  components: {
    Button: { defaultProps: { radius: 'sm', variant: 'filled' } },
    Badge:  { defaultProps: { radius: 'sm' } },
    Card:   { defaultProps: { radius: 'md', withBorder: true } },
    TextInput:  { defaultProps: { radius: 'sm' } },
    Textarea:   { defaultProps: { radius: 'sm' } },
    SegmentedControl: { defaultProps: { radius: 'sm' } },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
