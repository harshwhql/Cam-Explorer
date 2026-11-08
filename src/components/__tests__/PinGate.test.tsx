import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePinStore } from '@/storage/pinStore';
import { PinGate } from '../PinGate';

beforeEach(async () => {
  usePinStore.setState({ loaded: false, hasPin: false, unlocked: false, fails: { failures: 0, lastFailAt: 0 } });
  await usePinStore.getState().setPin('2580');
  usePinStore.setState({ loaded: true });
  usePinStore.getState().lock();
});

async function type(digits: string) {
  for (const d of digits) await fireEvent.press(screen.getByTestId(`pin-${d}`));
  await fireEvent.press(screen.getByTestId('pin-ok'));
}

describe('PinGate', () => {
  it('hides settings behind the PIN and unlocks with the right one', async () => {
    await render(
      <PinGate scope="settings">
        <Text>secret settings</Text>
      </PinGate>,
    );
    expect(screen.queryByText('secret settings')).toBeNull();
    expect(screen.getByText('Enter PIN')).toBeTruthy();
    await type('1357');
    expect(await screen.findByText('Wrong PIN')).toBeTruthy();
    await type('2580');
    expect(await screen.findByText('secret settings')).toBeTruthy();
  });

  it('app scope only applies when "lock the whole app" is on', async () => {
    await render(
      <PinGate scope="app">
        <Text>camera grid</Text>
      </PinGate>,
    );
    expect(screen.getByText('camera grid')).toBeTruthy();
  });

  it('shows nothing until the PIN state is known (fails closed)', async () => {
    usePinStore.setState({ loaded: false });
    await render(
      <PinGate scope="settings">
        <Text>secret settings</Text>
      </PinGate>,
    );
    expect(screen.queryByText('secret settings')).toBeNull();
  });
});
