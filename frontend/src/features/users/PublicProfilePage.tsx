import { useEffect, useState } from "react";
import { Plus, Play, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { apiClient, apiEnvelope } from "../../lib/api-client";
import { resolveUserIdentity } from "../../lib/identity-resolver";
import { resolveMedia } from "../../lib/media-resolver";
import { useAuthStore } from "../../stores/auth-store";
import { FeedPost } from "../../stores/feed-store";
import { useFollowStore } from "../../stores/follow-store";
import { useChatStore } from "../../stores/chat-store";
import { useFeedStore } from "../../stores/feed-store";
import { useFriendStore } from "../../stores/friend-store";
import { useStoryStore } from "../../stores/story-store";
import { PostCard } from "../feed/PostCard";
import { CreateStoryDialog } from "../stories/CreateStoryDialog";
import { StoryViewer } from "../stories/StoryViewer";
import { ProfileMediaGrid } from "./ProfileMediaGrid";
import { normalizePost } from "../../lib/api-normalizer";
import { StoryGroup } from "../stories/types";

export function PublicProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const profile = useFollowStore((state) =>
    userId ? state.profiles[userId] : undefined,
  );
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showCreateStoryDialog, setShowCreateStoryDialog] = useState(false);
  const storyGroups = useStoryStore((state) => state.storyGroups);

  useEffect(() => {
    if (!userId) return;
    void useFollowStore.getState().fetchProfile(userId);
  }, [userId]);

  useEffect(() => {
    void useStoryStore.getState().loadStoryFeed();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoadingPosts(true);
    apiEnvelope<FeedPost[]>(
      apiClient.get("/feed", { params: { userId, limit: 20 } }),
    )
      .then((response) => setPosts(response.data.map(normalizePost)))
      .finally(() => setLoadingPosts(false));
  }, [userId]);

  if (!profile)
    return <p className="text-sm text-gray-400">Loading profile...</p>;
  const isMe = currentUser?.id === profile.id;
  const profileId = profile.id;
  const mediaPosts = posts.filter((post) => post.media.length > 0);
  const restricted = !profile.canInteract;
  const identity = resolveUserIdentity(profile, isMe ? currentUser : undefined);
  const profileStoryBucket = storyGroups.find(
    (group) => group.user.id === profile.id,
  );
  const profileStory = firstUnseenOrFirst(profileStoryBucket);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-x-hidden">
      <section className="w-full max-w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-neon sm:p-5">
        <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:flex-wrap sm:items-start sm:text-left">
          <div
            className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br p-[2px] text-2xl font-semibold text-purple-200 ${
              profileStoryBucket
                ? "from-fuchsia-400 via-purple-500 to-sky-400 shadow-lg shadow-purple-500/30"
                : "from-purple-500/30 to-gray-800"
            }`}
          >
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gray-900">
              {identity.avatarUrl ? (
                <img
                  src={resolveMedia(identity.avatarUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                identity.initial
              )}
            </div>
          </div>
          <div className="w-full max-w-full min-w-0 flex-1 sm:min-w-64 sm:basis-64">
            <h1 className="max-w-full truncate whitespace-nowrap text-xl font-semibold text-gray-100">
              {identity.displayName}
            </h1>
            <p className="max-w-full truncate whitespace-nowrap text-sm text-gray-400">
              @{identity.username}
            </p>
            {profile.bio ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">
                {profile.bio}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-gray-400 sm:justify-start">
              <span>
                <strong className="text-gray-100">
                  {profile.followerCount}
                </strong>{" "}
                followers
              </span>
              <span>
                <strong className="text-gray-100">
                  {profile.followingCount}
                </strong>{" "}
                following
              </span>
              <span>
                <strong className="text-gray-100">{profile.postCount}</strong>{" "}
                posts
              </span>
            </div>
          </div>
          {isMe ? (
            <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto sm:justify-end">
              {profileStory ? (
                <Button
                  className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                  onClick={() =>
                    useStoryStore.getState().setActiveStoryId(profileStory.id)
                  }
                >
                  <Play size={15} />
                  View story
                </Button>
              ) : null}
              <Button onClick={() => setShowCreateStoryDialog(true)}>
                <Plus size={15} />
                Add story
              </Button>
              <Button
                className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                onClick={() => navigate("/settings")}
              >
                <Settings size={15} />
                Settings
              </Button>
            </div>
          ) : null}
          {!isMe ? (
            <div className="flex w-full min-w-0 flex-wrap justify-center gap-2 sm:w-56 sm:justify-end md:w-64">
              {profileStory ? (
                <Button
                  className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                  disabled={restricted}
                  onClick={() =>
                    useStoryStore.getState().setActiveStoryId(profileStory.id)
                  }
                >
                  <Play size={15} />
                  View story
                </Button>
              ) : null}
              {profile.canChat ? (
                <Button
                  disabled={restricted}
                  className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                  onClick={() => void startMessage()}
                >
                  Message
                </Button>
              ) : null}
              {friendAction(profile)}
              <Button
                disabled={restricted}
                onClick={() =>
                  void useFollowStore.getState().toggleFollow(profile.id)
                }
              >
                {profile.followedByMe ? "Following" : "Follow"}
              </Button>
              <Button
                className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                onClick={() => void toggleBlock()}
              >
                {profile.isBlockedByMe ? "Unblock" : "Block"}
              </Button>
              {!profile.isFriend ? (
                <Button
                  className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
                  onClick={() => void reportUser()}
                >
                  Report
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isMe && restricted ? (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            Kamu tidak bisa berinteraksi dengan user ini karena ada pembatasan
            interaksi.
          </p>
        ) : null}
        {!isMe && !restricted && !profile.canChat ? (
          <p className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-100">
            User ini belum menjadi teman. Direct chat baru hanya tersedia untuk
            teman.
          </p>
        ) : null}
      </section>

      <StoryViewer />
      <CreateStoryDialog
        open={showCreateStoryDialog}
        onClose={() => setShowCreateStoryDialog(false)}
        onCreated={() => {
          void useStoryStore.getState().loadStoryFeed();
        }}
      />

      <div className="flex w-full max-w-full rounded-xl border border-gray-800 bg-gray-900 p-1 shadow-neon">
        {(["posts", "media"] as const).map((item) => (
          <button
            key={item}
            className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 ${
              tab === item
                ? "bg-purple-600 text-white"
                : "text-gray-400 hover:bg-purple-500/10 hover:text-gray-100"
            }`}
            onClick={() => setTab(item)}
            type="button"
          >
            {item === "posts" ? "Posts" : "Media"}
          </button>
        ))}
      </div>

      {loadingPosts ? (
        <p className="text-sm text-gray-500">Loading profile posts...</p>
      ) : null}
      {tab === "posts" ? (
        <div className="w-full max-w-full space-y-4">
          {!loadingPosts && posts.length === 0 ? (
            <EmptyState title="No posts yet" />
          ) : null}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUser={currentUser} />
          ))}
        </div>
      ) : (
        <div className="w-full max-w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-900 p-1 shadow-neon">
          {!loadingPosts && mediaPosts.length === 0 ? (
            <EmptyState title="No media yet" />
          ) : null}
          <ProfileMediaGrid posts={mediaPosts} currentUser={currentUser} />
        </div>
      )}
    </div>
  );

  async function startMessage() {
    if (restricted) return;
    const conversation = await useChatStore
      .getState()
      .openDirectConversation(profileId);
    navigate(`/chat/${conversation.id}`);
  }

  async function toggleBlock() {
    const currentProfile = useFollowStore.getState().profiles[profileId];
    if (currentProfile?.isBlockedByMe)
      await useFollowStore.getState().unblockUser(profileId);
    else if (window.confirm("Block user ini?"))
      await useFollowStore.getState().blockUser(profileId);
  }

  async function reportUser() {
    const reason = window.prompt("Alasan report user ini?");
    if (!reason?.trim()) return;
    await useFeedStore
      .getState()
      .reportTarget("user", profileId, reason.trim());
    window.alert("Report terkirim.");
  }

  function friendAction(currentProfile: NonNullable<typeof profile>) {
    if (!currentProfile.canInteract) {
      return (
        <Button disabled className="bg-gray-800 shadow-none">
          Add Friend
        </Button>
      );
    }
    if (currentProfile.isFriend) {
      return (
        <Button
          className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
          onClick={() => void useFriendStore.getState().removeFriend(profileId)}
        >
          Remove Friend
        </Button>
      );
    }
    if (
      currentProfile.incomingFriendRequest &&
      currentProfile.incomingFriendRequestId
    ) {
      return (
        <>
          <Button
            onClick={() =>
              void useFriendStore
                .getState()
                .acceptRequest(currentProfile.incomingFriendRequestId!)
            }
          >
            Accept
          </Button>
          <Button
            className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
            onClick={() =>
              void useFriendStore
                .getState()
                .rejectRequest(currentProfile.incomingFriendRequestId!)
            }
          >
            Reject
          </Button>
        </>
      );
    }
    if (
      currentProfile.outgoingFriendRequest &&
      currentProfile.outgoingFriendRequestId
    ) {
      return (
        <Button
          className="bg-gray-800 shadow-none hover:from-purple-600 hover:to-purple-700"
          onClick={() =>
            void useFriendStore
              .getState()
              .cancelRequest(currentProfile.outgoingFriendRequestId!)
          }
        >
          Cancel Request
        </Button>
      );
    }
    return (
      <Button
        onClick={() => void useFriendStore.getState().requestFriend(profileId)}
      >
        Add Friend
      </Button>
    );
  }
}

function firstUnseenOrFirst(group?: StoryGroup) {
  return (
    group?.stories.find((story) => !story.seenAt && !story.seenByMe) ??
    group?.stories[0] ??
    null
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-center shadow-neon">
      <p className="font-semibold text-gray-100">{title}</p>
      <p className="mt-1 text-sm text-gray-500">Nothing to show here yet.</p>
    </section>
  );
}
