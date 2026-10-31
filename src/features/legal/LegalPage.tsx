import type { ReactNode } from 'react';

export type LegalPageKind = 'terms' | 'privacy' | 'returns';

const pages: Record<LegalPageKind, { title: string; intro: string; sections: { heading: string; body: ReactNode }[] }> = {
  terms: {
    title: 'Conditions générales de vente',
    intro: 'Modèle à compléter et faire valider avant toute vente réelle. Les champs entre crochets sont obligatoires et ne doivent pas rester tels quels en production.',
    sections: [
      { heading: '1. Vendeur', body: 'Vendeur : [raison sociale], [forme juridique], capital [montant], immatriculation [RCS/SIREN], siège social [adresse], TVA intracommunautaire [numéro si applicable]. Contact : [e-mail et téléphone]. Directeur de publication : [nom]. Hébergeur : [nom, adresse et contact].' },
      { heading: '2. Champ d’application', body: 'Les présentes conditions encadrent les ventes réalisées sur ce site auprès des consommateurs. Les caractéristiques essentielles, le prix TTC, les frais de livraison, les délais et les éventuelles restrictions sont présentés avant la validation de la commande.' },
      { heading: '3. Commande et prix', body: 'La commande n’est définitive qu’après récapitulatif, acceptation des conditions et confirmation. Les prix doivent être affichés en euros TTC. Le vendeur doit corriger les erreurs manifestes et informer le client de toute indisponibilité.' },
      { heading: '4. Paiement et livraison', body: 'Les moyens de paiement acceptés, le prestataire de paiement, les délais et zones de livraison ainsi que les frais doivent être précisés ici avant activation des ventes. Une commande de démonstration ne constitue pas une vente ni une confirmation de paiement.' },
      { heading: '5. Garanties légales et médiation', body: 'Le consommateur bénéficie des garanties légales applicables, notamment de conformité et des vices cachés. Ajouter les coordonnées du médiateur de la consommation compétent et les modalités de saisine avant publication.' },
      { heading: '6. Droit applicable', body: 'Les droits impératifs du consommateur demeurent applicables. Le droit applicable et les modalités de règlement des litiges doivent être précisés sans priver le consommateur de ses droits légaux.' },
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    intro: 'Notice de transparence à compléter selon les traitements réellement mis en œuvre, les prestataires et la durée de conservation.',
    sections: [
      { heading: '1. Responsable du traitement', body: 'Responsable : [raison sociale et adresse]. Contact confidentialité : [e-mail]. Délégué à la protection des données, si désigné : [coordonnées].' },
      { heading: '2. Données et finalités', body: 'Les données de compte servent à l’authentification et à la gestion du compte. Les adresses et commandes servent à traiter les achats et livraisons. Les données de sécurité servent à protéger le service. Ne collecter que les données nécessaires à chaque finalité.' },
      { heading: '3. Bases légales et destinataires', body: 'Préciser, pour chaque finalité, la base légale applicable (contrat, obligation légale, intérêt légitime ou consentement). Identifier les prestataires d’hébergement, de paiement, d’e-mail et de livraison ainsi que les éventuels transferts hors EEE.' },
      { heading: '4. Conservation et sécurité', body: 'Définir les durées de conservation par catégorie, y compris les commandes et pièces comptables. Des mesures techniques et organisationnelles protègent les accès ; aucun système ne peut garantir une sécurité absolue.' },
      { heading: '5. Vos droits', body: 'Selon les conditions prévues par le RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité ou vous opposer à certains traitements. Contact : [e-mail]. Vous pouvez également déposer une réclamation auprès de la CNIL.' },
      { heading: '6. Cookies et traceurs', body: 'Décrire les cookies strictement nécessaires et tous les traceurs non essentiels. Obtenir le consentement préalable lorsque la loi l’exige, permettre son retrait aussi simplement que son accord et documenter les durées de vie.' },
    ],
  },
  returns: {
    title: 'Livraison, retours et remboursements',
    intro: 'Politique à adapter aux produits, à la logistique et aux exigences légales applicables avant l’ouverture des commandes réelles.',
    sections: [
      { heading: '1. Livraison', body: 'Zones desservies : [zones]. Transporteur : [prestataire]. Délais indicatifs : [délais]. Frais : [tarifs]. Le client reçoit les informations de suivi lorsqu’elles sont disponibles.' },
      { heading: '2. Droit de rétractation', body: 'Pour les ventes à distance aux consommateurs, le délai légal est généralement de 14 jours à compter de la réception du bien, sous réserve des exceptions prévues par la loi. Fournir un formulaire type et expliquer clairement les exceptions applicables à certains produits.' },
      { heading: '3. Procédure de retour', body: 'Contact retour : [adresse e-mail ou portail]. Indiquer les étapes, l’adresse de retour, l’état attendu des produits et la responsabilité des frais de retour. Ne pas imposer de conditions qui limitent les droits légaux du consommateur.' },
      { heading: '4. Remboursement', body: 'Les remboursements sont effectués dans les délais légaux et, en principe, via le moyen de paiement initial, sauf accord contraire conforme à la loi. Préciser le traitement des frais de livraison et la procédure en cas de produit non conforme.' },
      { heading: '5. Réclamations et garanties', body: 'Contact : [coordonnées]. Les garanties légales de conformité et des vices cachés restent applicables indépendamment de la politique commerciale de retour.' },
    ],
  },
};

export function LegalPage({ page, onBack }: { page: LegalPageKind; onBack: () => void }) {
  const content = pages[page];
  return (
    <section className="workspace-page legal-page">
      <button className="back-link" onClick={onBack}>← Retour à la boutique</button>
      <span className="eyebrow">ATELIER · INFORMATIONS</span>
      <h1 className="workspace-title">{content.title}<span className="brand-period">.</span></h1>
      <p className="workspace-intro">{content.intro}</p>
      {content.sections.map((section) => (
        <section className="seller-panel" key={section.heading} style={{ marginTop: 16 }}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <p className="fine-print">Ces textes sont des modèles d’information et non un avis juridique. Faites-les vérifier et remplacez tous les champs entre crochets par les informations exactes de l’entreprise et de ses prestataires.</p>
    </section>
  );
}
