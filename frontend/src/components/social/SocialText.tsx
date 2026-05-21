import { renderSocialText } from '../../lib/social-formatting';

export function SocialText({ text }: { text: string }) {
  return <>{renderSocialText(text)}</>;
}
