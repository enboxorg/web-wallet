import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabList, Tab, TabPanel } from '../Tabs';

describe('Tabs', () => {
  describe('TabList', () => {
    it('renders with tablist role', () => {
      render(
        <TabList>
          <Tab>First</Tab>
          <Tab>Second</Tab>
        </TabList>,
      );
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('merges custom className', () => {
      render(
        <TabList className="custom-tabs">
          <Tab>Tab</Tab>
        </TabList>,
      );
      expect(screen.getByRole('tablist').className).toContain('custom-tabs');
    });
  });

  describe('Tab', () => {
    it('renders with tab role', () => {
      render(<Tab>My Tab</Tab>);
      expect(screen.getByRole('tab', { name: 'My Tab' })).toBeInTheDocument();
    });

    it('has aria-selected when active', () => {
      render(<Tab active>Active Tab</Tab>);
      expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
    });

    it('has aria-selected false when inactive', () => {
      render(<Tab>Inactive Tab</Tab>);
      expect(screen.getByRole('tab')).not.toHaveAttribute('aria-selected', 'true');
    });

    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Tab onClick={onClick}>Clickable</Tab>);
      await user.click(screen.getByRole('tab'));
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('shows accent underline when active', () => {
      render(<Tab active>Active</Tab>);
      const tab = screen.getByRole('tab');
      // The underline is an aria-hidden span child
      const underline = tab.querySelector('[aria-hidden="true"]');
      expect(underline).toBeInTheDocument();
    });

    it('does not show underline when inactive', () => {
      render(<Tab>Inactive</Tab>);
      const tab = screen.getByRole('tab');
      const underline = tab.querySelector('[aria-hidden="true"]');
      expect(underline).not.toBeInTheDocument();
    });
  });

  describe('TabPanel', () => {
    it('renders children when active', () => {
      render(<TabPanel active>Panel content</TabPanel>);
      expect(screen.getByText('Panel content')).toBeInTheDocument();
    });

    it('does not render when inactive', () => {
      render(<TabPanel>Hidden panel</TabPanel>);
      expect(screen.queryByText('Hidden panel')).not.toBeInTheDocument();
    });

    it('has tabpanel role', () => {
      render(<TabPanel active>Content</TabPanel>);
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('merges custom className', () => {
      render(<TabPanel active className="custom-panel">Content</TabPanel>);
      expect(screen.getByRole('tabpanel').className).toContain('custom-panel');
    });
  });
});
