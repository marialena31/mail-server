# Mail Server API — Documentation Complète

API Node.js Express pour l’envoi d’emails avec ou sans pièce jointe, sécurité avancée et intégration frontend.

---

## Fonctionnalités principales
- Envoi d’emails via `/api/mail/send` (texte + pièce jointe optionnelle)
- Contrôle et  automatique (, désactivable)
- Protection API : clé d’API, CSRF token
- Alerte mail en cas de dépassement de quota 
- Suppression automatique des fichiers temporaires

---

## Configuration backend

### `.env` minimal
```env
PORT=3000
NODE_ENV=development
API_KEY=... # clé d’API
CSRF_SECRET=... # secret CSRF
ALLOWED_ORIGINS=http://localhost:3000,https://ton-site.fr
SMTP_HOST=...
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tonmail@domaine.fr
SMTP_PASS=motdepasse
SMTP_FROM=tonmail@domaine.fr
USE_FAKE_MAILER=true
=ta_clé_virustotal
=true
```

---

## Endpoints principaux

### `POST /api/mail/send`
- **Content-Type** : `application/json` (sans fichier) ou `multipart/form-data` (avec fichier)
- **Champs requis** : `to`, `subject`, `text`
- **Champ optionnel** : `file` (pièce jointe)
- **Headers obligatoires** : `x-api-key`, `x-csrf-token`

### `GET /api/mail/config`
- Récupère la config publique, dont le token CSRF

---

## Sécurité et 
- Extensions autorisées : `.pdf`, `.png`, `.jpg`, `.jpeg`
- Taille max : 5 Mo
- Scan  si activé (clé + `=true`)
- Si quota  dépassé : mail d’alerte à `SMTP_USER` et message explicite à l’utilisateur

---

## Procédure côté frontend (React, etc.)

### 1. Récupérer le CSRF token
```js
const config = await fetch('http://localhost:3000/api/mail/config').then(r => r.json());
const csrfToken = config.csrfToken;
```

### 2. Préparer l’envoi du mail

#### Sans pièce jointe
```js
await fetch('http://localhost:3000/api/mail/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'ta_clé_api',
    'x-csrf-token': csrfToken
  },
  body: JSON.stringify({
    to: 'destinataire@mail.com',
    subject: 'Sujet',
    text: 'Message'
  })
});
```

#### Avec pièce jointe
```js
const formData = new FormData();
formData.append('to', 'destinataire@mail.com');
formData.append('subject', 'Sujet');
formData.append('text', 'Message');
formData.append('file', fichier); // fichier = File JS

await fetch('http://localhost:3000/api/mail/send', {
  method: 'POST',
  headers: {
    'x-api-key': 'ta_clé_api',
    'x-csrf-token': csrfToken
    // NE PAS mettre Content-Type, le navigateur le gère !
  },
  body: formData
});
```

### 3. Validation JS côté frontend
```js
const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
const maxSize = 5 * 1024 * 1024; // 5 Mo
function validateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!allowedExtensions.includes(ext)) return false;
  if (file.size > maxSize) return false;
  return true;
}
```

### 4. Gestion des erreurs côté frontend
- **Quota  dépassé** (code 429) :
  ```js
  if (response.status === 429) {
    alert('Le  est temporairement indisponible (quota  atteint).');
  }
  ```
- **Fichier non autorisé** (code 400) : affiche le message d’erreur du backend
- **Erreur serveur** (code 500) : affiche un message générique

---

## Résumé du workflow
1. Le frontend récupère le CSRF token
2. Prépare la requête (FormData si fichier, JSON sinon)
3. Envoie la requête POST `/api/mail/send` avec les bons headers
4. Le backend contrôle, scanne, envoie le mail, puis répond
5. Le frontend affiche le résultat ou l’erreur à l’utilisateur

---

## Bonnes pratiques
- Mets à jour les URLs selon ton environnement
- Place la clé  uniquement si tu veux le scan (et dans les limites d’usage)
- Pour la prod, préfère une solution antivirus locale si tu dépasses les quotas 

---

**Pour toute question ou exemple de composant React, voir le code source ou demander à l’équipe technique.**

### Update Configuration
```json
PUT /api/mail/config
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "your-email@example.com",
  "pass": "your-password"
}
```
