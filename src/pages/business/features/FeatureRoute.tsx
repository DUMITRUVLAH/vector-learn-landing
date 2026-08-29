/**
 * Rezolvă `/business/features/<slug>` la o pagină de feature.
 *
 * Un slug necunoscut nu trebuie să dea ecran alb: îl ducem înapoi pe landing, unde omul
 * are ce face, în loc să-l lăsăm într-o rută moartă.
 */
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ds";
import { FeatureLandingPage } from "./FeatureLandingPage";
import { getFeature } from "./features";

export function FeatureRoute({ slug }: { slug: string }) {
  const feature = getFeature(slug);
  if (!feature) return <FeatureNotFound />;
  return <FeatureLandingPage feature={feature} />;
}

function FeatureNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-bold">Pagina asta nu există</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Poate a fost redenumită. Toate capacitățile sunt listate pe pagina de produs.
      </p>
      <Button href="/business">
        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Înapoi la produs
      </Button>
    </div>
  );
}
