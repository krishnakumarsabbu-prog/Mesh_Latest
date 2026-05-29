import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleAlert as AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ivory-200 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl bg-neutral-100 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-neutral-400" />
        </div>
        <h1 className="text-6xl font-bold text-neutral-900 tracking-tight mb-2">404</h1>
        <p className="text-lg text-neutral-500 mb-8">Page not found</p>
        <Button icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
