import React, { createContext, useState } from "react";

interface BackupSeedContextProps {
  showSeedScreen: boolean;
  toggleSeedScreen: () => void;
  backupSeed: string | undefined;
  setBackupSeed: (seed: string) => void;
  removeBackupSeed: () => void;
}

export const BackupSeedContext = createContext<BackupSeedContextProps>({ 
  showSeedScreen: false,
  toggleSeedScreen: () => {},
  backupSeed: undefined,
  setBackupSeed: () => {},
  removeBackupSeed: () => {},
});

export const BackupSeedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backupSeed, setBackupSeedState ] = useState<string | undefined>(undefined);
  const [showSeedScreen, setShowSeedScreen] = useState<boolean>(false);

  const toggleSeedScreen = () => {
    setShowSeedScreen(!showSeedScreen);
  }

  const setBackupSeed = (seed: string) => {
    setBackupSeedState(seed);
  }

  const removeBackupSeed = () => {
    setBackupSeedState(undefined);
  }

  return (
    <BackupSeedContext.Provider value={{
      backupSeed,
      setBackupSeed,
      removeBackupSeed,
      showSeedScreen,
      toggleSeedScreen
    }}>
      {children}
    </BackupSeedContext.Provider>
  );
};
