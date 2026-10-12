import { SystemStatus } from "@/components/system-status";

export default function Home() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-start gap-8 px-4 py-16 sm:justify-center">
        <p className="text-base font-bold text-muted-foreground">
          Memory Lane <span aria-hidden="true">·</span> in development
        </p>
        <h1 className="font-heading text-4xl leading-tight text-balance hyphens-auto sm:text-5xl">
          Reminiscence sessions, personal to them.
        </h1>
        <p className="text-lg text-muted-foreground">
          Music, films, food and places from the years that mattered to the person you care for,
          with gentle prompts to start a conversation.
        </p>
        <SystemStatus />
      </main>
      <footer className="border-t px-4 py-6 text-center text-base text-muted-foreground">
        Memory Lane supports reminiscence activities. It is not a medical device and does not
        diagnose or treat any condition.
      </footer>
    </>
  );
}
