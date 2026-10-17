import React, {createContext, useContext} from 'react';
import {emptyRegistry, type Registry} from '../domain/workflowV07/registry';

/** Owner-designated default reviewer identity for offline drafts; a signed-in profile overrides it. */
export const DEFAULT_REVIEWER = 'Noppadon P · Engineer';
export interface RegistryContextValue {registry: Registry; reviewerName: string}
const RegistryCtx = createContext<RegistryContextValue>({registry: emptyRegistry(), reviewerName: ''});
export const RegistryProvider = ({value, children}: {value: RegistryContextValue; children: React.ReactNode}) => <RegistryCtx.Provider value={value}>{children}</RegistryCtx.Provider>;
export const useRegistry = () => useContext(RegistryCtx);
