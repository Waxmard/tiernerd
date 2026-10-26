import type { StackScreenProps } from '@react-navigation/stack';

export type RootStackParamList = {
  Main: undefined;
  Profile: undefined;
  ListDetail: {
    listId: string;
    listTitle: string;
    promptAddItem?: boolean;
    completedItemId?: string;
  };
  Login: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  StackScreenProps<RootStackParamList, T>;
