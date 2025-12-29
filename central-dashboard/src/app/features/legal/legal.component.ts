import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../core/services/translation.service';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';

type LegalPageType = 'privacy' | 'terms' | 'legal';

interface LegalContent {
  title: string;
  lastUpdate: string;
  sections: Array<{
    title: string;
    content: string[];
  }>;
}

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, LanguageSelectorComponent],
  template: `
    <div class="legal-container">
      <div class="language-corner">
        <app-language-selector></app-language-selector>
      </div>

      <div class="legal-card">
        <div class="legal-header">
          <a routerLink="/login" class="back-link" [attr.aria-label]="'auth.backToLogin' | translate">
            <span aria-hidden="true">&larr;</span> {{ 'auth.backToLogin' | translate }}
          </a>
          <img src="assets/neopro-logo.png" alt="Logo Neopro" class="legal-logo" />
          <h1>{{ content?.title }}</h1>
          <p class="last-update">{{ 'legal.lastUpdate' | translate }}: {{ content?.lastUpdate }}</p>
        </div>

        <nav class="legal-nav" aria-label="Pages juridiques">
          <a
            routerLink="/legal/privacy"
            [class.active]="pageType === 'privacy'"
          >{{ 'legal.privacyPolicy' | translate }}</a>
          <a
            routerLink="/legal/terms"
            [class.active]="pageType === 'terms'"
          >{{ 'legal.termsOfService' | translate }}</a>
          <a
            routerLink="/legal/mentions"
            [class.active]="pageType === 'legal'"
          >{{ 'legal.legalMentions' | translate }}</a>
        </nav>

        <div class="legal-content" role="main">
          <section *ngFor="let section of content?.sections" class="legal-section">
            <h2>{{ section.title }}</h2>
            <p *ngFor="let paragraph of section.content">{{ paragraph }}</p>
          </section>
        </div>

        <div class="legal-footer">
          <p>{{ 'legal.questions' | translate }} <a href="mailto:privacy@neopro.fr">privacy&#64;neopro.fr</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .legal-container {
      min-height: 100vh;
      background: linear-gradient(135deg, var(--neo-hockey-dark, #2022E9) 0%, var(--neo-purple-dark, #3A0686) 100%);
      padding: 2rem;
      position: relative;
    }

    .language-corner {
      position: absolute;
      top: 1rem;
      right: 1rem;
    }

    .legal-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 3rem;
    }

    .legal-header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
      font-size: 0.9rem;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .legal-logo {
      max-width: 160px;
      height: auto;
      margin-bottom: 1rem;
    }

    .legal-header h1 {
      font-size: 1.75rem;
      color: #1e293b;
      margin: 0 0 0.5rem 0;
      font-family: var(--neo-font-heading);
    }

    .last-update {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0;
    }

    .legal-nav {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .legal-nav a {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      text-decoration: none;
      color: #64748b;
      font-size: 0.9rem;
      transition: all 0.2s;
      background: #f1f5f9;
    }

    .legal-nav a:hover {
      background: #e2e8f0;
      color: #334155;
    }

    .legal-nav a.active {
      background: var(--neo-hockey-dark, #2022E9);
      color: white;
    }

    .legal-content {
      max-height: 60vh;
      overflow-y: auto;
      padding-right: 1rem;
    }

    .legal-section {
      margin-bottom: 2rem;
    }

    .legal-section h2 {
      font-size: 1.25rem;
      color: #1e293b;
      margin: 0 0 1rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--neo-hockey-dark, #2022E9);
    }

    .legal-section p {
      color: #475569;
      line-height: 1.7;
      margin: 0 0 1rem 0;
      font-size: 0.95rem;
    }

    .legal-footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .legal-footer p {
      color: #64748b;
      font-size: 0.9rem;
      margin: 0;
    }

    .legal-footer a {
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
    }

    .legal-footer a:hover {
      text-decoration: underline;
    }

    /* Scrollbar styling */
    .legal-content::-webkit-scrollbar {
      width: 8px;
    }

    .legal-content::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 4px;
    }

    .legal-content::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }

    .legal-content::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }

    @media (max-width: 768px) {
      .legal-card {
        padding: 1.5rem;
      }

      .legal-nav {
        flex-direction: column;
        align-items: stretch;
      }

      .legal-nav a {
        text-align: center;
      }
    }

    /* Focus visible pour navigation clavier */
    a:focus-visible {
      outline: 3px solid var(--neo-hockey-dark, #2022E9);
      outline-offset: 2px;
    }
  `]
})
export class LegalComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly translationService = inject(TranslationService);

  pageType: LegalPageType = 'privacy';
  content: LegalContent | null = null;

  private readonly legalContents: Record<LegalPageType, LegalContent> = {
    privacy: {
      title: 'Politique de Confidentialite',
      lastUpdate: '29 decembre 2024',
      sections: [
        {
          title: '1. Responsable du traitement',
          content: [
            'NEOPRO est une solution de gestion d\'affichage dynamique destinee aux clubs sportifs. Le responsable du traitement des donnees est la societe exploitant la plateforme NEOPRO.',
            'Contact Protection des Donnees : privacy@neopro.fr'
          ]
        },
        {
          title: '2. Donnees collectees',
          content: [
            'Donnees de compte utilisateur : email professionnel, nom complet, mot de passe (hashe), role, statut.',
            'Donnees de connexion : adresse IP, horodatage, user-agent (conservees 12 mois).',
            'Donnees techniques des equipements : ID site, metriques systeme, version logicielle.',
            'Nous ne collectons PAS de donnees de sante, donnees biometriques, donnees de mineurs, ou geolocalisation en temps reel.'
          ]
        },
        {
          title: '3. Finalites du traitement',
          content: [
            'Gestion des comptes utilisateurs (base legale : execution du contrat)',
            'Authentification et securite (base legale : execution du contrat)',
            'Monitoring des equipements (base legale : execution du contrat)',
            'Statistiques d\'affichage (base legale : interet legitime)',
            'Amelioration du service (base legale : interet legitime)'
          ]
        },
        {
          title: '4. Destinataires des donnees',
          content: [
            'Acces interne : personnel technique habilite, service client.',
            'Sous-traitants : Supabase Inc. (base de donnees, UE), Render Services Inc. (hebergement), Better Stack (logs, UE).',
            'Les transferts hors UE sont encadres par le EU-US Data Privacy Framework ou des clauses contractuelles types.'
          ]
        },
        {
          title: '5. Duree de conservation',
          content: [
            'Compte utilisateur actif : duree de la relation contractuelle.',
            'Logs de connexion : 12 mois glissants.',
            'Statistiques d\'affichage : 24 mois.',
            'Donnees de facturation : 10 ans (obligations comptables).'
          ]
        },
        {
          title: '6. Securite des donnees',
          content: [
            'Chiffrement des communications (TLS 1.3)',
            'Hachage des mots de passe (bcrypt)',
            'Authentification multi-facteurs disponible',
            'Chiffrement des sauvegardes (AES-256-GCM)',
            'Isolation des donnees par client (Row-Level Security)'
          ]
        },
        {
          title: '7. Vos droits',
          content: [
            'Droit d\'acces (Art. 15 RGPD) : obtenir une copie de vos donnees.',
            'Droit de rectification (Art. 16) : corriger des donnees inexactes.',
            'Droit a l\'effacement (Art. 17) : supprimer vos donnees.',
            'Droit a la portabilite (Art. 20) : exporter vos donnees.',
            'Pour exercer vos droits : privacy@neopro.fr ou fonction "Exporter mes donnees" / "Supprimer mon compte" dans les parametres.',
            'Vous pouvez introduire une reclamation aupres de la CNIL (www.cnil.fr).'
          ]
        },
        {
          title: '8. Cookies',
          content: [
            'NEOPRO utilise uniquement des cookies strictement necessaires (authentification de session, 8 heures).',
            'Aucun cookie publicitaire, de tracking tiers, ou de reseaux sociaux n\'est utilise.'
          ]
        }
      ]
    },
    terms: {
      title: 'Conditions Generales d\'Utilisation',
      lastUpdate: '29 decembre 2024',
      sections: [
        {
          title: '1. Objet',
          content: [
            'Les presentes Conditions Generales d\'Utilisation (CGU) definissent les modalites d\'utilisation de la plateforme NEOPRO, solution de gestion d\'affichage dynamique pour clubs sportifs.',
            'L\'acces et l\'utilisation de la Plateforme sont subordonnes a l\'acceptation prealable des presentes CGU.'
          ]
        },
        {
          title: '2. Definitions',
          content: [
            'Plateforme : ensemble des services NEOPRO accessibles via le tableau de bord web.',
            'Utilisateur : toute personne physique disposant d\'un compte sur la Plateforme.',
            'Client : entite (club, association, entreprise) ayant souscrit un abonnement.',
            'Site : emplacement physique equipe d\'un boitier NEOPRO.',
            'Contenu : tout fichier video, image ou configuration televerse.'
          ]
        },
        {
          title: '3. Acces a la Plateforme',
          content: [
            'Les comptes utilisateurs sont crees par un administrateur habilite du Client.',
            'L\'Utilisateur s\'engage a maintenir la confidentialite de ses identifiants et a utiliser un mot de passe robuste (8 caracteres minimum).',
            'L\'Utilisateur est seul responsable des actions effectuees depuis son compte.'
          ]
        },
        {
          title: '4. Obligations de l\'Utilisateur',
          content: [
            'Utiliser la Plateforme conformement a sa destination et a la legislation en vigueur.',
            'Ne pas telecharger de contenus illicites, diffamatoires, portant atteinte a la vie privee, ou violant les droits de propriete intellectuelle.',
            'L\'Utilisateur est seul responsable des contenus qu\'il televerse.'
          ]
        },
        {
          title: '5. Propriete intellectuelle',
          content: [
            'La Plateforme, son code source et sa documentation sont la propriete exclusive de l\'Editeur.',
            'L\'Utilisateur beneficie d\'une licence d\'utilisation non exclusive limitee a la duree de l\'abonnement.',
            'L\'Utilisateur conserve la propriete de ses contenus.'
          ]
        },
        {
          title: '6. Responsabilite',
          content: [
            'L\'Editeur s\'engage a fournir la Plateforme avec diligence.',
            'La responsabilite de l\'Editeur est limitee aux dommages directs et previsibles.',
            'La responsabilite totale est plafonnee au montant des sommes versees au cours des 12 derniers mois.'
          ]
        },
        {
          title: '7. Suspension et suppression de compte',
          content: [
            'L\'Editeur peut suspendre l\'acces en cas de violation des CGU ou de comportement frauduleux.',
            'L\'Utilisateur peut demander la suppression de son compte via les parametres ou par email a privacy@neopro.fr.'
          ]
        },
        {
          title: '8. Droit applicable',
          content: [
            'Les presentes CGU sont regies par le droit francais.',
            'En cas de litige, les parties s\'engagent a rechercher une solution amiable.'
          ]
        }
      ]
    },
    legal: {
      title: 'Mentions Legales',
      lastUpdate: '29 decembre 2024',
      sections: [
        {
          title: '1. Editeur',
          content: [
            'La plateforme NEOPRO est editee par la societe exploitant le service.',
            'Contact : contact@neopro.fr',
            'Pour toute question relative aux donnees personnelles : privacy@neopro.fr'
          ]
        },
        {
          title: '2. Hebergement',
          content: [
            'Serveur applicatif : Render Services, Inc. - 525 Brannan Street, Suite 300, San Francisco, CA 94107, USA',
            'Base de donnees : Supabase Inc. - 970 Toa Payoh North #07-04, Singapore 318992',
            'Les serveurs de base de donnees sont situes dans l\'Union Europeenne (Irlande).'
          ]
        },
        {
          title: '3. Propriete intellectuelle',
          content: [
            'L\'ensemble du contenu de la plateforme (textes, images, logos, interface) est protege par le droit de la propriete intellectuelle.',
            'Toute reproduction ou representation, totale ou partielle, est interdite sans autorisation prealable.'
          ]
        },
        {
          title: '4. Protection des donnees personnelles',
          content: [
            'Conformement au RGPD et a la loi Informatique et Libertes, vous disposez de droits sur vos donnees personnelles.',
            'Consultez notre Politique de Confidentialite pour plus de details.',
            'Contact DPO : privacy@neopro.fr'
          ]
        },
        {
          title: '5. Cookies',
          content: [
            'La plateforme utilise uniquement des cookies strictement necessaires au fonctionnement du service.',
            'Aucun cookie de mesure d\'audience ou publicitaire n\'est utilise.'
          ]
        },
        {
          title: '6. Credits',
          content: [
            'NEOPRO - Solution d\'affichage dynamique pour clubs sportifs',
            'Developpement et conception : Equipe NEOPRO'
          ]
        }
      ]
    }
  };

  ngOnInit(): void {
    this.translationService.initializeLanguage();

    this.route.params.subscribe(params => {
      const page = params['page'] as string;
      if (page === 'privacy' || page === 'terms' || page === 'mentions') {
        this.pageType = page === 'mentions' ? 'legal' : page;
      } else {
        this.pageType = 'privacy';
      }
      this.content = this.legalContents[this.pageType];
    });
  }
}
