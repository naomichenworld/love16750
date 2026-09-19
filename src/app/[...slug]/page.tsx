'use client';
// 無效網址提示（v1.9）— 移除開發里程碑文字，僅提供一般訪客提示
import React from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/ui/PageText';

export default function NotFoundPage() {
  const router = useRouter();
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/">NOT FOUND</PageTitle>
        <p>網址錯誤或該頁面已被刪除</p>
      </div>
      <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
        <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>
          找不到您要尋找的頁面。
        </p>
        <button className="btn btn-dark" onClick={() => router.push('/')}>返回首頁</button>
      </div>
    </section>
  );
}