import { useBackupSeed } from '@/contexts/Context';
import { Web5UserAgent } from '@enbox/user-agent';
import { useCallback, useEffect, useState } from 'react';
import CyberPinInput from './ui/CyberPinInput';
import FormInput from './ui/FormInput';
import FormButton from './ui/FormButton';
import EnboxLogo from './EnboxLogo';

const LoadAgent:React.FC<{
  agent: Web5UserAgent | undefined;
  initialized: boolean;
  initialize: (password: string, dwnEndpoint: string) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
}> = ({ agent, initialized, initialize, unlock }) => {

  const { setBackupSeed } = useBackupSeed();

  const [pin, setPin] = useState(['', '', '', '']);
  const [invalidPin, setInvalidPin] = useState(false);
  const [dwnEndpoint, setDwnEndpoint] = useState('https://dwn.enbox.org/latest');

  // Auto-submit in both modes when 4 digits are present
  useEffect(() => {
    if (pin.length === 4 && pin.every(digit => digit !== '')) {
      const pinString = pin.join('');
      handleAgentSetup(pinString);
    }
  }, [ pin ]);

  const handleAgentSetup = useCallback(async (password: string) => {
   if (agent && !initialized && password) {
      try {
        const recoveryPhrase = await initialize(password, dwnEndpoint);
        if (recoveryPhrase) {
          setBackupSeed(recoveryPhrase);
        }
      } finally {
        // reset the password and auto submit regardless of the result
        setPin(['', '', '', '']);
      }
    } else if (initialized && password) {

      try {
        await unlock(password);
        setInvalidPin(false);
      } catch (error) {
        setInvalidPin(true);

        setTimeout(() => {
          // remove the error message after 1.5 seconds
          setInvalidPin(false);
        }, 1500);

      } finally {
        // reset the password and auto submit regardless of the result
        setPin(['', '', '', '']);
      }
    }
  }, [ agent, initialized, dwnEndpoint ]);

  const handleUnlock =  useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const pinString = pin.join('');
    return handleAgentSetup(pinString);
  }, [ pin ]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-bg-primary via-dark-bg-secondary to-dark-bg-primary">
        {/* Animated Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-dark-accent-purple/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-dark-accent-pink/8 rounded-full blur-3xl animate-glow" />
        <div className="absolute top-3/4 left-3/4 w-64 h-64 bg-dark-accent-violet/6 rounded-full blur-2xl" />
        
        {/* Grid Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className={`relative w-full max-w-lg mx-auto ${invalidPin ? 'animate-bounce' : ''}`}>
        {/* Main Container */}
        <div className="bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <EnboxLogo size={64} />
                <div className="absolute inset-0 bg-dark-accent-purple/20 rounded-full blur-xl animate-pulse" />
              </div>
            </div>
            
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2 bg-gradient-to-r from-dark-accent-purple to-dark-accent-pink bg-clip-text text-transparent">
              {initialized ? "Unlock Wallet" : "Set up Wallet"}
            </h1>
            
            <p className="text-dark-text-secondary text-lg">
              Enter your 4-digit PIN to {initialized ? "continue" : "get started"}
            </p>
          </div>

          <form autoComplete="off" onSubmit={handleUnlock} className="space-y-6">
            {/* PIN Input */}
            <div className="space-y-4">
              <CyberPinInput 
                initialPin={pin} 
                onPinChange={(updatedPin) => setPin(updatedPin)}
                variant="glass"
                size="lg"
                error={invalidPin}
                className="justify-center"
              />
              
              {/* Error Message */}
              <div className="text-center min-h-[1.5rem]">
                {invalidPin && (
                  <p className="text-red-400 text-sm flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Invalid PIN. Please try again.
                  </p>
                )}
              </div>
            </div>

            {/* DWN Endpoint for Setup */}
            {!initialized && (
              <div className="space-y-4">
                <FormInput
                  label="DWN Endpoint"
                  value={dwnEndpoint}
                  onChange={(e) => setDwnEndpoint(e.target.value)}
                  variant="glass"
                  placeholder="https://dwn.enbox.org/latest"
                />
              </div>
            )}

            {/* Submit Button */}
            <FormButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={pin.some(digit => digit === '')}
              className="w-full"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={initialized ? "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" : "M13 10V3L4 14h7v7l9-11h-7z"} />
                </svg>
              }
            >
              {initialized ? "Unlock" : "Continue"}
            </FormButton>
          </form>

          {/* Footer Tip */}
          <div className="text-center mt-6">
            <p className="text-dark-text-tertiary text-sm">
              💡 Tip: You can paste your 4-digit PIN
            </p>
          </div>
        </div>

        {/* Ambient Light Effects */}
        <div className="absolute -inset-4 bg-gradient-to-r from-dark-accent-purple/5 via-transparent to-dark-accent-pink/5 rounded-3xl blur-2xl -z-10" />
      </div>
    </div>
  );
}

export default LoadAgent;