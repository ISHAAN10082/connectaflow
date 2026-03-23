"use client";

import dynamic from 'next/dynamic';

export const ClientOnlyControlPanel = dynamic(
  () => import('@/components/ControlPanel').then((mod) => mod.ControlPanel),
  {
    ssr: false,
    loading: () => null,
  }
);
