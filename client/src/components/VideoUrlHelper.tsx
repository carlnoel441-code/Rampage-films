import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Info, Copy, Check } from "lucide-react";
import { useState } from "react";
import { validateVideoUrl, getUrlExamples, type VideoUrlValidation } from "@/utils/videoUrlValidation";
import { useToast } from "@/hooks/use-toast";

interface VideoUrlHelperProps {
  onUrlValidated?: (url: string, validation: VideoUrlValidation) => void;
}

export function VideoUrlHelper({ onUrlValidated }: VideoUrlHelperProps) {
  const { toast } = useToast();
  const [testUrl, setTestUrl] = useState("");
  const [validation, setValidation] = useState<VideoUrlValidation | null>(null);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);

  const examples = getUrlExamples();

  const handleValidate = () => {
    if (!testUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a URL to validate",
        variant: "destructive",
      });
      return;
    }

    const result = validateVideoUrl(testUrl);
    setValidation(result);
    
    // Don't auto-fill - user must click "Use This URL" button
  };

  const handleCopyExample = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedExample(url);
    setTimeout(() => setCopiedExample(null), 2000);
    toast({
      title: "Copied!",
      description: "Example URL copied to clipboard",
    });
  };

  const handleUseUrl = () => {
    if (validation?.isValid && onUrlValidated) {
      onUrlValidated(testUrl, validation);
      toast({
        title: "URL Added!",
        description: "Video URL has been added to the form",
      });
    }
  };

  return (
    <Card className="p-6 border-primary/20">
      <h3 className="text-lg font-semibold mb-4">Video URL Validator & Helper</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Test & Validate URL
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Paste video URL here to validate..."
              value={testUrl}
              onChange={(e) => {
                setTestUrl(e.target.value);
                setValidation(null);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleValidate()}
              data-testid="input-url-validator"
              className="flex-1"
            />
            <Button
              onClick={handleValidate}
              disabled={!testUrl.trim()}
              data-testid="button-validate-url"
            >
              Validate
            </Button>
          </div>
        </div>

        {validation && (
          <div
            className={`p-4 rounded-lg border ${
              validation.isValid
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
            data-testid="validation-result"
          >
            <div className="flex items-start gap-3">
              {validation.isValid ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${validation.isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {validation.isValid ? 'Valid URL' : 'Invalid URL'}
                </p>
                <p className="text-sm text-foreground/70 mt-1">
                  Platform: <span className="font-medium capitalize">{validation.platform}</span>
                </p>
                {validation.message && (
                  <p className="text-sm text-foreground/70 mt-1">
                    {validation.message}
                  </p>
                )}
                {validation.extractedId && (
                  <p className="text-sm text-foreground/70 mt-1">
                    Video ID: <code className="bg-background/50 px-1 rounded">{validation.extractedId}</code>
                  </p>
                )}
              </div>
            </div>
            {validation.isValid && onUrlValidated && (
              <Button
                onClick={handleUseUrl}
                className="mt-3 w-full"
                data-testid="button-use-validated-url"
              >
                Use This URL
              </Button>
            )}
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-4 w-4" />
            <h4 className="text-sm font-semibold">Supported URL Formats</h4>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">YouTube</p>
              <div className="space-y-1">
                {examples.youtube.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-youtube-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-youtube-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Vimeo</p>
              <div className="space-y-1">
                {examples.vimeo.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-vimeo-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-vimeo-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Dailymotion</p>
              <div className="space-y-1">
                {examples.dailymotion.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-dailymotion-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-dailymotion-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Tokyvideo</p>
              <div className="space-y-1">
                {examples.tokyvideo.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-tokyvideo-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-tokyvideo-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Ok.ru (Odnoklassniki)</p>
              <div className="space-y-1">
                {examples.okru.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-okru-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-okru-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">FlixHQ</p>
              <div className="space-y-1">
                {examples.flixhq.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-flixhq-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-flixhq-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Direct Video Files</p>
              <div className="space-y-1">
                {examples.direct.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <code className="text-xs bg-card p-2 rounded flex-1 border" data-testid={`example-direct-${idx}`}>
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyExample(url)}
                      data-testid={`button-copy-direct-${idx}`}
                    >
                      {copiedExample === url ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-card/50 rounded border space-y-2">
          <p className="text-xs text-foreground/70">
            <strong>Tip:</strong> Paste any video URL above to check if it's formatted correctly. 
            The validator will identify the platform and check the URL structure. For FlixHQ and Ok.ru, 
            make sure you're copying the full watch/video page URL, not just the homepage.
          </p>
          <p className="text-xs text-foreground/70">
            <strong>Platform Compatibility:</strong> All platforms (YouTube, Vimeo, Dailymotion, Tokyvideo, Ok.ru, and Direct MP4) work on both mobile and desktop devices.
          </p>
        </div>
      </div>
    </Card>
  );
}
