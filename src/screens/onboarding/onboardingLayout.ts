import { StyleSheet } from 'react-native';

export const SETUP_TOTAL_STEPS = 4;

export function setupEyebrow(step: number): string {
  return `SETUP · ${step} OF ${SETUP_TOTAL_STEPS}`;
}

export const onboardingStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
  },
  hero: {
    marginBottom: 32,
  },
  eyebrow: {
    color: '#9A9AA2',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
    textAlign: 'left',
  },
  title: {
    color: '#F5F5F7',
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.3,
    lineHeight: 40,
    marginTop: 14,
    textAlign: 'left',
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  subtitle: {
    color: '#9A9AA2',
    fontSize: 14.5,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 320,
    textAlign: 'left',
  },
  footer: {
    gap: 4,
    paddingBottom: 30,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#6E6E73',
  },
  continueText: {
    color: '#0A0A0C',
    fontSize: 14,
    fontWeight: '600',
  },
  continueTextDisabled: {
    color: '#0A0A0C',
    fontWeight: '500',
  },
  skipButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
  },
  skipText: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '500',
  },
  optionRow: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionRowSelected: {
    borderColor: '#2E2E36',
    backgroundColor: '#18181D',
  },
  optionTitle: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  optionSub: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    marginTop: 4,
  },
  optionList: {
    gap: 12,
  },
});
