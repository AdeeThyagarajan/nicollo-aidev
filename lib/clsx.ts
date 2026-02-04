export default function clsx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}
