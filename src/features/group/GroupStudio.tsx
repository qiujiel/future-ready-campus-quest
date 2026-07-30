import { type FormEvent, useEffect, useState } from "react";
import type { PublicGroupIdentity } from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ToastRegion } from "../../ui/ToastRegion";
import { GroupImageUploader } from "./GroupImageUploader";
import {
  type GroupStudioGateway,
  supabaseGroupStudioGateway,
} from "./groupStudioGateway";

export interface GroupMember {
  studentId: string;
  nickname: string;
}

export function GroupStudio({
  currentStudentId,
  gateway = supabaseGroupStudioGateway,
  group: initialGroup,
  isEditor,
  members,
  prepareImage,
}: {
  currentStudentId: string | null;
  gateway?: GroupStudioGateway;
  group: PublicGroupIdentity | null;
  isEditor: boolean;
  members: GroupMember[];
  prepareImage?: (file: File) => Promise<File>;
}) {
  const [group, setGroup] = useState(initialGroup);
  const [canEdit, setCanEdit] = useState(isEditor);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!group?.imageObjectPath) return;
    gateway
      .getImageUrl(group.groupId)
      .then((url) => {
        if (active) setImageUrl(url);
      })
      .catch(() => {
        if (active) setImageUrl(null);
      });
    return () => {
      active = false;
    };
  }, [gateway, group?.groupId, group?.imageObjectPath]);

  if (!group || !currentStudentId) {
    return (
      <main className="route-shell">
        <p className="eyebrow">Session needed</p>
        <h1>Return through your class link</h1>
        <p>Your teacher can reopen joining or issue a recovery link.</p>
        <a className="primary-action" href="#/">
          Ask your teacher for help
        </a>
      </main>
    );
  }

  const locked = Boolean(group.lockedAt);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || busy || locked) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      setGroup(
        await gateway.rename(group.groupId, String(form.get("displayName") ?? "")),
      );
      setMessage("Group name saved");
    } catch {
      setMessage("The group name was not changed");
    } finally {
      setBusy(false);
    }
  }

  async function transfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || busy || locked) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      setGroup(await gateway.transferEditor(
        group.groupId,
        String(form.get("nextEditorId") ?? ""),
      ));
      setCanEdit(false);
      setMessage("Editing passed to your teammate");
    } catch {
      setMessage("Editing could not be transferred");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="group-studio quest-content">
      <header className="group-studio__header">
        <div>
          <p className="eyebrow">Group {group.groupNumber} studio</p>
          <h1>{group.displayName}</h1>
          <p>Shape one shared identity before the quest begins.</p>
        </div>
        {imageUrl ? (
          <img
            className="group-avatar"
            src={imageUrl}
            alt={`${group.displayName} group image`}
          />
        ) : (
          <div className="group-avatar" aria-hidden="true">
            {group.groupNumber}
          </div>
        )}
      </header>

      {locked ? (
        <p className="group-lock-note">
          Your teacher has locked the group identity for this session.
        </p>
      ) : null}

      <div className="group-studio__grid">
        <Card title="Your crew" eyebrow="Nicknames only">
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.studentId}>
                {member.nickname}
                {member.studentId === currentStudentId ? " (you)" : ""}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Shared group identity" eyebrow={canEdit ? "You can edit" : "View only"}>
          {canEdit ? (
            <div className="quest-stack">
              <p>
                You are the first explorer here, so you can shape the shared
                name and image. Pass editing on when you are ready.
              </p>
              <form className="stacked-form" onSubmit={rename}>
                <label>
                  Group name
                  <input
                    name="displayName"
                    minLength={2}
                    maxLength={40}
                    defaultValue={group.displayName}
                    disabled={locked || busy}
                    required
                  />
                </label>
                <Button type="submit" busy={busy} disabled={locked}>
                  Save group name
                </Button>
              </form>
              <GroupImageUploader
                disabled={locked}
                {...(prepareImage ? { prepareImage } : {})}
                onUpload={async (file, onProgress) => {
                  setGroup(await gateway.uploadImage(group.groupId, file, onProgress));
                  setMessage("Group image ready");
                }}
              />
              <form className="stacked-form" onSubmit={transfer}>
                <label>
                  Next group editor
                  <select name="nextEditorId" disabled={locked || busy}>
                    {members
                      .filter((member) => member.studentId !== currentStudentId)
                      .map((member) => (
                        <option key={member.studentId} value={member.studentId}>
                          {member.nickname}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  busy={busy}
                  disabled={locked || members.length < 2}
                >
                  Transfer editing
                </Button>
              </form>
            </div>
          ) : (
            <p>
              Your group editor is shaping this space. Everyone’s nickname stays
              visible while real names remain teacher-only.
            </p>
          )}
        </Card>
      </div>
      <ToastRegion message={message} />
    </main>
  );
}
