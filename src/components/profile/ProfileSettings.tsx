// The settings/edit panel Phase 10c's audit found entirely missing from
// profile.astro's markup (O5) — islands/profile.ts's wireEvents()/populate()
// bind #settings, #edit-open, #edit-cancel, #settings-form, #verify-btn,
// #input-photo-file, #input-name and #input-photo defensively, but none of
// those elements exist anywhere, so every one of those binds is a no-op.
// This component is the real, working replacement: it doesn't reuse that
// island (deleted alongside profile.astro in the Phase 10c base-shell
// conversion), it ports the same Firebase calls with real markup and adds
// the progress/cancel UX that was never built.
//
// Mounted inside src/components/profile/Profile.tsx (owned by a parallel
// conversion) — see the "ProfileSettings mounts here" comment there for the
// exact contract this fulfills: props { user: User }, and on a successful
// save this component pushes the refreshed user into authStore itself so
// Nav.tsx's useAuth() reflects a same-session name/avatar change without
// waiting on the next onAuthStateChanged firing.
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type SubmitEvent } from 'react';
import { sendEmailVerification, updateProfile, type User } from 'firebase/auth';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { auth, authStore } from '@/lib/auth';
import { getUserName, setUserName } from '@/lib/storage';
import { showToast } from '@/lib/toast';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

// No existing provider-label mapping elsewhere in the codebase — Profile.tsx's
// own providerLabel() (for the chip row and the #prov stat tile) just strips
// '.com' off the raw providerId (e.g. "google"). This is a friendlier,
// plain-English label for this panel; swap Profile.tsx to use it too if the
// terser form isn't wanted there.
const PROVIDER_LABELS: Record<string, string> = {
  password: 'Email',
  'google.com': 'Google',
  'facebook.com': 'Facebook',
  'github.com': 'GitHub',
  'twitter.com': 'Twitter',
  'apple.com': 'Apple',
  phone: 'Phone',
};

export function getProviderLabel(user: User): string {
  const id = user.providerData[0]?.providerId;
  if (!id) return '—';
  return PROVIDER_LABELS[id] ?? id.replace(/\.com$/, '').replace(/^[a-z]/, (c) => c.toUpperCase());
}

function validateAvatarFile(file: File): string | null {
  if (!/^image\//i.test(file.type)) return 'Please choose an image file.';
  if (file.size > MAX_AVATAR_BYTES) return 'Image must be under 3 MB.';
  return null;
}

function isCanceledError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'storage/canceled';
}

// Same path/options islands/profile.ts's uploadAvatar() used
// (avatars/{uid}/{ts}-{filename}, image/* + 3MB validated by the caller,
// cacheControl: public,max-age=31536000 — mirrors the Storage security
// rules in FIREBASE_SETUP.md #2, keep in sync if either side changes).
// What's new: the state_changed callback was an empty body with a comment
// saying there was no progress UI; here it drives onProgress off the real
// snapshot.bytesTransferred/totalBytes, and the caller gets the UploadTask
// itself back so a Cancel button can call task.cancel() for a real
// mid-upload cancel path — neither existed before.
function startAvatarUpload(
  file: File,
  uid: string,
  onProgress: (pct: number) => void,
): { task: UploadTask; result: Promise<string> } {
  const storage = getStorage();
  const path = `avatars/${uid}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
  const fileRef = storageRef(storage, path);
  const task = uploadBytesResumable(fileRef, file, { cacheControl: 'public,max-age=31536000' });

  const result = new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        onProgress(snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0);
      },
      (err) => reject(err),
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      },
    );
  });

  return { task, result };
}

// Mirrors AuthDialog.tsx's useSubmitLock: each call site gets its own
// independent busy flag, so Save and Verify email can't fight over one lock.
function useSubmitLock(): [boolean, (task: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

export interface ProfileSettingsProps {
  user: User;
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const [name, setName] = useState(user.displayName ?? getUserName() ?? '');
  const [photoUrl, setPhotoUrl] = useState(user.photoURL ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [saving, runSave] = useSubmitLock();
  const [verifying, runVerify] = useSubmitLock();
  const taskRef = useRef<UploadTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke the just-selected file's object URL whenever it's replaced or the
  // component unmounts. Replaces islands/profile.ts's bare
  // `setTimeout(() => URL.revokeObjectURL(url), 5000)`, which was guessing at
  // "long enough for the browser to have painted it" — too short and the
  // preview goes blank mid-view if the panel is left open past 5s, too long
  // and the blob leaks. Tying revocation to the effect's own cleanup means it
  // happens exactly once, exactly when the URL stops being needed.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // user.emailVerified only reflects reality as of the last token
  // refresh/onAuthStateChanged firing. reload() re-fetches it once on mount
  // so a verification completed in another tab is picked up here on the next
  // visit, without standing up a live subscription for one field.
  useEffect(() => {
    let cancelled = false;
    user
      .reload()
      .then(() => {
        if (!cancelled) setEmailVerified(user.emailVerified);
      })
      .catch(() => {
        // Offline, or the session was revoked — keep showing the last known
        // state rather than throwing.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError('');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleCancelUpload(): void {
    taskRef.current?.cancel();
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError('');

    void runSave(async () => {
      // Precedence, matching islands/profile.ts's #settings-form handler
      // exactly: the URL field seeds finalPhotoURL, then an uploaded file
      // overrides it. If both are set, the upload wins.
      let finalPhotoURL: string | null = photoUrl.trim() || null;

      if (selectedFile) {
        try {
          const { task, result } = startAvatarUpload(selectedFile, user.uid, setUploadProgress);
          taskRef.current = task;
          setUploadProgress(0);
          finalPhotoURL = await result;
        } catch (err) {
          if (isCanceledError(err)) {
            setError('Upload canceled.');
          } else {
            setError(err instanceof Error ? err.message : 'Upload failed.');
          }
          return;
        } finally {
          taskRef.current = null;
          setUploadProgress(null);
        }
      }

      try {
        // updateProfile() JSON-encodes this object as-is and Firebase's
        // accounts:update endpoint rejects an explicit `null` for either
        // field ("displayname/photourl must be string") — this bug existed
        // in islands/profile.ts too (`|| null`), just never exercised
        // because #settings-form never existed to call it. `undefined`
        // drops the key from the JSON body entirely, which both the real
        // API and the emulator treat as "leave unchanged" — matching the
        // intended "don't clear on empty" semantics documented below.
        await updateProfile(user, {
          displayName: name.trim() || undefined,
          photoURL: finalPhotoURL || undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed.');
        return;
      }

      // Sole writer of ff_user_name (Appendix B) — the course certificate's
      // learner-name source (O6). Matches the old code's behavior of only
      // mirroring a non-empty name, so clearing the field here doesn't wipe
      // a name the certificate already has.
      if (name.trim()) setUserName(name.trim());

      // updateProfile() doesn't trigger onAuthStateChanged, and useAuth() is
      // this page's and Nav.tsx's only read path — without this push,
      // neither reflects a same-session name/avatar change (see the gap
      // documented in src/lib/auth.ts and the comment in Profile.tsx).
      authStore.set({ user: auth.currentUser ?? user, status: 'in' });

      if (selectedFile) {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      setPhotoUrl(finalPhotoURL ?? '');
      showToast('Profile updated');
    });
  }

  function handleVerifyClick(): void {
    void runVerify(async () => {
      try {
        await sendEmailVerification(user);
        showToast('Verification email sent.');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not send verification email');
      }
    });
  }

  const avatarSrc = previewUrl ?? (photoUrl.trim() || user.photoURL || null);
  const initials = (name || user.email || 'U').slice(0, 2).toUpperCase();
  const uploading = uploadProgress !== null;

  return (
    <section className="settings card" aria-labelledby="settings-heading">
      <h2 id="settings-heading">Edit Profile</h2>
      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="avatar-wrap">
          {avatarSrc ? (
            // legacy.css's base `.avatar` rule is `display: none` — the
            // header avatar toggles that off via the `hidden` attribute
            // (Profile.tsx), but nothing in this panel needs that
            // hidden/shown dance since the two states are just two different
            // elements. The inline style is a belt-and-suspenders override
            // in case that base rule ever gets applied here too.
            <img className="avatar" style={{ display: 'block' }} src={avatarSrc} alt="" />
          ) : (
            <div className="avatar-fallback" aria-hidden="true">
              {initials}
            </div>
          )}
        </div>

        <label htmlFor="input-name">
          Display name
          <input
            id="input-name"
            name="name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label htmlFor="input-photo">
          Photo URL
          <input
            id="input-photo"
            name="photoUrl"
            type="url"
            placeholder="https://…"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
        </label>

        <label htmlFor="input-photo-file">
          Or upload an image (image files, up to 3 MB)
          <input
            id="input-photo-file"
            name="photoFile"
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
        </label>

        {uploading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div
              className="progress-bar"
              style={{ flex: 1 }}
              role="progressbar"
              aria-label="Avatar upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress ?? 0}
            >
              <div className="progress-fill" style={{ '--p': `${uploadProgress}%` } as CSSProperties} />
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleCancelUpload}>
              Cancel Upload
            </button>
          </div>
        )}

        <p className="form-error" role="alert" aria-live="assertive" hidden={!error}>
          {error}
        </p>

        <div className="chip-row">
          <span className="chip">{emailVerified ? 'Email verified' : 'Email not verified'}</span>
          <span className="chip">{`Provider: ${getProviderLabel(user)}`}</span>
        </div>

        {!emailVerified && (
          <button type="button" className="btn btn-ghost" onClick={handleVerifyClick} disabled={verifying}>
            {verifying ? 'Sending…' : 'Verify Email'}
          </button>
        )}

        <div className="settings-actions">
          <button type="submit" id="settings-submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </section>
  );
}
