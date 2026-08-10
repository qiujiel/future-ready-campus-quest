import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupImageUploader } from "../../src/features/group/GroupImageUploader";
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
  uploadCalls: File[];
} {
  return {
    renameCalls: [],
    uploadCalls: [],
    async rename(_groupId, displayName) {
      this.renameCalls.push(displayName);
      return { ...group, displayName };
    },
    async uploadImage(_groupId, file, onProgress) {
      this.uploadCalls.push(file);
      onProgress(45);
      onProgress(100);
      return { ...group, imageObjectPath: "cohort/group/image.webp" };
    },
    async getImageUrl() {
      return "https://signed.invalid/group-image.webp";
    },
  };
}

describe("Group Studio", () => {
  it("lets the group leader rename the group without student transfer controls", async () => {
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

    expect(screen.getByText(/you are the group leader/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/group name/i), {
      target: { value: "Future Makers" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save group name/i }));
    await waitFor(() => expect(api.renameCalls).toEqual(["Future Makers"]));
    expect(screen.getByLabelText(/group name/i)).toBeVisible();
    expect(screen.queryByLabelText(/next group editor/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /transfer editing/i }),
    ).not.toBeInTheDocument();
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
        prepareImage={async (file) => file}
      />,
    );
    const input = screen.getByLabelText(/group image/i);

    const badFile = new File(["not-an-image"], "notes.txt", {
      type: "text/plain",
    });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/png, jpeg, or webp/i);
    expect(container.querySelector("img[alt='New group image preview']")).toBeNull();

    const goodFile = new File(["image"], "team.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [goodFile] } });
    expect(container.querySelector("img[alt='New group image preview']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /upload group image/i }));

    await waitFor(() => expect(api.uploadCalls).toEqual([goodFile]));
    expect(screen.getByText(/upload complete/i)).toBeVisible();
  });

  it("uploads a resized metadata-free WebP instead of the original file", async () => {
    const prepared = new File(["prepared"], "group-image.webp", {
      type: "image/webp",
    });
    const prepareImage = vi.fn(async () => prepared);
    const onUpload = vi.fn(async () => {});
    render(
      <GroupImageUploader
        prepareImage={prepareImage}
        onUpload={onUpload}
      />,
    );

    const original = new File(["original"], "camera.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText(/group image/i), {
      target: { files: [original] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload group image/i }));

    await waitFor(() => expect(prepareImage).toHaveBeenCalledWith(original));
    expect(onUpload).toHaveBeenCalledWith(prepared, expect.any(Function));
  });

  it("resolves the private object path to a signed group image", async () => {
    render(
      <GroupStudio
        group={{ ...group, imageObjectPath: "cohort/group/image.webp" }}
        members={members}
        currentStudentId="student-2"
        isEditor={false}
        gateway={gateway()}
      />,
    );

    expect(
      await screen.findByRole("img", { name: /group 2 group image/i }),
    ).toHaveAttribute("src", "https://signed.invalid/group-image.webp");
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
    expect(screen.getByText(/group leader is shaping this space/i)).toBeVisible();
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
