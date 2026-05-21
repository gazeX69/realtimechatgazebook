import { IsIn } from "class-validator";

export const STORY_REACTION_EMOJIS = ["❤️", "😂", "😮", "🔥", "😢"] as const;

export class ReactStoryDto {
  @IsIn(STORY_REACTION_EMOJIS)
  emoji: (typeof STORY_REACTION_EMOJIS)[number];
}
