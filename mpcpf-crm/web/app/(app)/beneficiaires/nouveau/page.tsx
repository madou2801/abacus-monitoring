import Link from "next/link";
import { NewBeneficiaryForm } from "./NewBeneficiaryForm";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="p-6 lg:p-8">
      <Link href="/beneficiaires" className="text-sm text-slate-500 hover:underline">← Bénéficiaires</Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-slate-900">Nouveau bénéficiaire</h1>
      <p className="mb-6 text-sm text-slate-500">
        Saisie manuelle d'un prospect (appel direct, salon…). Le dossier est créé à l'étape Lead, source « manuel », et vous en devenez le propriétaire.
      </p>
      <NewBeneficiaryForm />
    </div>
  );
}
