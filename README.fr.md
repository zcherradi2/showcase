# Persona — les gens votent, l'analyste décide

Un test de personnalité ordinaire vous demande de vous décrire, puis vous revend votre
propre description. Persona fait l'inverse.

Les personnes qui vous connaissent répondent au même questionnaire, et leurs réponses
deviennent votre **Persona** : la version de vous qui circule réellement dans le monde.
Vous y répondez aussi, avant de voir le moindre vote, et c'est votre **Ego**, l'histoire
que vous racontez sur vous-même. L'écart entre les deux, c'est là que surgit l'**Ombre** :
la part qu'aucun des deux récits ne couvre, déduite par un analyste et jamais présentée
comme un fait.

Le calcul est fait en C# déterministe. Le modèle se contente de raconter, donc chaque
lecture peut être ramenée aux chiffres qui l'ont produite.

## Lancer le projet

```powershell
.\tools\dev.ps1            # compile et sert sur http://127.0.0.1:8130
.\tools\test.ps1           # 62 tests
node tools\e2e.mjs         # 20 vérifications dans un navigateur sans interface
```

Il faut .NET 9. Pas de npm, pas d'étape de compilation : le frontend est en modules ES
natifs.

## L'idée en trois temps

- **Persona — la donnée.** Ce que la salle dit de vous. Pondéré par la proximité : votre
  cercle proche pèse plus qu'un inconnu qui a suivi un lien.
- **Ego — le récit.** Ce que vous dites de vous. Rempli avant de voir un seul vote, donc
  impossible à ajuster après coup.
- **Ombre — le reste.** Là où les deux récits ne se recouvrent pas. Toujours formulée
  comme une hypothèse, jamais comme un diagnostic.

## Pour aller plus loin

- [RUN-REPORT.md](RUN-REPORT.md) — ce qui a été construit, vérifié, et ce qui reste non prouvé.
- [SCALING.md](SCALING.md) — ce qui casse en premier sous un trafic réel, et où intervenir.
- En anglais : [README.md](README.md) · en espagnol : [README.es.md](README.es.md)
