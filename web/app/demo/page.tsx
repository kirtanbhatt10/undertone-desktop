import type { Metadata } from 'next';
import { DemoApp } from '@/components/DemoApp';

export const metadata: Metadata = {
  title: 'Undertone — browser demo',
  description: 'Try the Undertone interface in your browser with simulated replies.',
};

export default function DemoPage() {
  return <DemoApp />;
}
