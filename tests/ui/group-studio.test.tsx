import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupStudio } from "../../src/features/group/GroupStudio";
import type { GroupStudioGateway } from "../../src/features/group/groupStudioGateway";

const group = {
  groupId: "60000000-0000-4000-8000-000000000001",
  groupNumber: 2,
  displayName: "Group 2",
  imageObjectPath: null,
  lockedAt: null,
};

const members = [
  { studentId: "student-1", nickname: "Bright Comet" },
  { studentId: "student-2", nickname: "Silver Fern" },
];

function gateway(): GroupStudioGateway & {
  renameCalls: string[];
  transferCalls: string[];
  uploadCalls: File[];
} {
  return {
    renameCalls: [],
    transferCalls: [],
    uploadCalls: [],
    async rename(_groupId, displayName) {
      this.renameCalls.push(displayName);
      return { ...group, displayName };
    },
    async transferEditor(_groupId, studentId) {
      this.transferCalls.push(studentId);
      return group;
    },
    async uploadImage(_groupId, file, onProgress) {
      this.uploadCalls.push(file);
      onProgress(45);
      onProgress(100);
      return { ...group, imageObjectPath: "cohort/group/image.webp" };
    },
  };
}

describe("Group Studio", () => {
  it("lets the first-member editor rename the group and transfer editing", async () => {
    const api = gateway();
    render(
      <GroupStudio
        group={group}
        members={members}
        currentStudentId="student-1"
        isEditor
        gateway={api}
      />,
    );

    expect(screen.getByText(/you are the first explorer here/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/group name/i), {
      target: { value: "Future Makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save group name/i }));
    await waitFor(() => expect(api.renameCalls).toEqual(["Future Makers"]));

    fireEvent.change(screen.getByLabelText(/next group editor/i), {
      target: { value: "student-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /transfer editing/i }));
    await waitFor(() => expect(api.transferCalls).toEqual(["student-2"]));
  });

  it("validates image type, previews valid images, and reports upload progress", async () => {
    const api = gateway();
    const { container } = render(
      <GroupStudio
        group={group}
        members={members}
        currentStudentId="student-1"
        isEditor
        gateway={api}
      />,
    );
    const input = screen.getByLabelText(/group image/i);

    const badFile = new File(["not-an-image"], "notes.txt", {
      type: "text/plain",
    });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/png, jpeg, or webp/i);

    const goodFile = new File(["image"], "team.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [goodFile] } });
    expect(container.querySelector("img[alt='New group image preview']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /upload group image/i }));

    await waitFor(() => expect(api.uploadCalls).toEqual([goodFile]));
    expect(screen.getByText(/upload complete/i)).toBeVisible();
  });

  it("shows a read-only nickname list to ordinary members", () => {
    render(
      <GroupStudio
        group={group}
        members={members}
        currentStudentId="student-2"
        isEditor={false}
        gateway={gateway()}
      />,
    );

    expect(screen.getByText("Bright Comet")).toBeVisible();
    expect(screen.getByText(/Silver Fern/)).toBeVisible();
    expect(screen.queryByLabelText(/group name/i)).not.toBeInTheDocument();
    expect(screen.getByText(/group editor is shaping this space/i)).toBeVisible();
  });

  it("explains a teacher lock and a missing-session recovery action", () => {
    const { rerender } = render(
      <GroupStudio
        group={{ ...group, lockedAt: "2026-07-31T00:00:00Z" }}
        members={members}
        currentStudentId="student-1"
        isEditor
        gateway={gateway()}
      />,
    );
    expect(screen.getByText(/teacher has locked the group identity/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /save group name/i })).toBeDisabled();

    rerender(
      <GroupStudio
        group={null}
        members={[]}
        currentStudentId={null}
        isEditor={false}
        gateway={gateway()}
      />,
    );
    expect(screen.getByRole("link", { name: /ask your teacher for help/i })).toHaveAttribute(
      "href",
      "#/",
    );
  });
});
