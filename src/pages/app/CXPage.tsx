import { AppShell } from "@/components/app/AppShell";

export function CXPage() {
  return (
    <AppShell 
      pageTitle="Grupe (CX)" 
      pageDescription="Interfață integrată pentru gestiunea grupelor"
    >
      <div className="w-full h-[calc(100vh-14rem)] border border-border rounded-xl overflow-hidden bg-background shadow-sm">
        <iframe
          src="https://vector-crm-academy.lovable.app/cx"
          className="w-full h-full border-none"
          title="Vector CRM Academy - CX"
          allow="camera; microphone; fullscreen; display-capture"
        />
      </div>
    </AppShell>
  );
}
