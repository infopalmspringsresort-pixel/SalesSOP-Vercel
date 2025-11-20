import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Utensils, Edit, X } from "lucide-react";
import type { MenuPackage, MenuItem } from "@shared/schema-client";
import MenuItemEditor from "./menu-item-editor";

interface MenuSelectionFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (selectedPackages: string[], customMenuItems: Record<string, any>) => void;
  initialSelectedPackages?: string[];
  initialCustomMenuItems?: Record<string, any>;
}

export default function MenuSelectionFlow({ 
  open, 
  onOpenChange, 
  onSave,
  initialSelectedPackages = [],
  initialCustomMenuItems = {}
}: MenuSelectionFlowProps) {
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [editingPackage, setEditingPackage] = useState<MenuPackage | null>(null);
  const [customMenuItems, setCustomMenuItems] = useState<any>({});
  const [showMenuItemEditor, setShowMenuItemEditor] = useState(false);
  
  // Fetch menu items to auto-initialize when package is selected
  const { data: packageItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menus/items"],
    enabled: open,
  });
  const { toast } = useToast();

  // Fetch menu packages
  const { data: menuPackages = [], isLoading } = useQuery<MenuPackage[]>({
    queryKey: ["/api/menus/packages"],
    enabled: open,
  });

  // Reset state when dialog opens and sync with provided initial data
  useEffect(() => {
    if (!open) {
      return;
    }

    setEditingPackage(null);
    setShowMenuItemEditor(false);

    if (initialSelectedPackages.length > 0) {
      setSelectedPackages(initialSelectedPackages);
    } else if (Object.keys(initialCustomMenuItems).length > 0) {
      setSelectedPackages(Object.keys(initialCustomMenuItems));
    } else {
      setSelectedPackages([]);
    }

    if (Object.keys(initialCustomMenuItems).length > 0) {
      setCustomMenuItems({ ...initialCustomMenuItems });
    } else {
      setCustomMenuItems({});
    }
  }, [open, initialSelectedPackages, initialCustomMenuItems]);

  const createDefaultPackageData = (packageId: string) => {
    const menuPackage = menuPackages.find(pkg => pkg.id === packageId);
    if (!menuPackage) {
      return null;
    }

    const filteredItems = packageItems.filter((item: any) => {
      const itemPackageId = typeof item.packageId === 'string' ? item.packageId : item.packageId?.toString();
      return itemPackageId === packageId;
    });

    const selectedItemsWithDetails = filteredItems.map((item: any) => {
      const quantity = (item.quantity !== undefined && item.quantity !== null) ? item.quantity : 1;
      return {
        id: item.id || item._id?.toString(),
        name: item.name,
        price: item.price || 0,
        additionalPrice: item.additionalPrice || 0,
        isPackageItem: true,
        quantity,
      };
    });

    return {
      selectedItems: selectedItemsWithDetails,
      customItems: [],
      totalPackageItems: filteredItems.length,
      excludedItemCount: 0,
      totalDeduction: 0,
      packageId,
      customPackagePrice: menuPackage.price || 0,
    };
  };

  // Auto-initialize package items when packageItems are loaded
  useEffect(() => {
    if (!open || packageItems.length === 0 || selectedPackages.length === 0) {
      return;
    }

    setCustomMenuItems(prev => {
      const updates: Record<string, any> = {};

      selectedPackages.forEach(packageId => {
        if (!prev[packageId]) {
          const defaultData = createDefaultPackageData(packageId);
          if (defaultData) {
            updates[packageId] = defaultData;
          }
        }
      });

      if (Object.keys(updates).length === 0) {
        return prev;
      }

      return {
        ...prev,
        ...updates,
      };
    });
  }, [open, selectedPackages, packageItems, menuPackages]);

  const handlePackageSelect = (packageId: string) => {
    setSelectedPackages(prev => {
      if (prev.includes(packageId)) {
        setCustomMenuItems(prevItems => {
          if (!prevItems[packageId]) {
            return prevItems;
          }
          const updatedItems = { ...prevItems };
          delete updatedItems[packageId];
          return updatedItems;
        });
        return prev.filter(id => id !== packageId);
      }

      // Auto-initialize when package is selected
      if (packageItems.length > 0) {
        const defaultData = createDefaultPackageData(packageId);
        if (defaultData) {
          setCustomMenuItems(prevItems => ({
            ...prevItems,
            [packageId]: defaultData,
          }));
        }
      }

      return [...prev, packageId];
    });
  };

  const handleEditPackage = (menuPackage: MenuPackage) => {
    setEditingPackage(menuPackage);
    setShowMenuItemEditor(true);
  };

  const handleMenuItemsSave = (data: any) => {
    if (editingPackage) {
      setCustomMenuItems(prev => ({
        ...prev,
        [editingPackage.id!]: {
          selectedItems: data.selectedItems,
          customItems: data.customItems || [],
          totalPackageItems: data.totalPackageItems,
          excludedItemCount: data.excludedItemCount,
          totalDeduction: data.totalDeduction, // Total price of excluded items
          packageId: editingPackage.id,
          customPackagePrice: prev[editingPackage.id!]?.customPackagePrice ?? editingPackage.price ?? 0,
        }
      }));
    }
    setShowMenuItemEditor(false);
    setEditingPackage(null);
  };

  const handlePackagePriceChange = (packageId: string, value: string) => {
    const parsedValue = parseFloat(value);
    const sanitizedValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;

    setCustomMenuItems(prev => ({
      ...prev,
      [packageId]: {
        ...prev[packageId],
        customPackagePrice: sanitizedValue,
      },
    }));
  };

  const handleSave = async () => {
    if (selectedPackages.length === 0) {
      toast({
        title: "No package selected",
        description: "Please select at least one menu package to save.",
        variant: "destructive",
      });
      return;
    }

    const preparedCustomMenuItems: Record<string, any> = {};

    for (const packageId of selectedPackages) {
      let packageData = customMenuItems[packageId];

      const sanitizeArrayField = (value: any) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (value === undefined || value === null) {
          return [];
        }
        return [value];
      };

      if (!packageData || !Array.isArray(packageData.selectedItems) || packageData.selectedItems.length === 0) {
        const menuPackage = menuPackages.find(pkg => pkg.id === packageId);

        if (!menuPackage) {
          toast({
            title: "Error",
            description: "Menu package not found",
            variant: "destructive",
          });
          return;
        }

        const targetPackageId = typeof packageId === 'string' ? packageId : packageId?.toString();

        let filteredItems = packageItems.filter((item: any) => {
          const itemPackageId = typeof item.packageId === 'string' ? item.packageId : item.packageId?.toString();
          return itemPackageId === targetPackageId;
        });

        if (filteredItems.length === 0 && packageItems.length === 0) {
          try {
            const response = await fetch('/api/menus/items');
            if (response.ok) {
              const allItems = await response.json();
              filteredItems = allItems.filter((item: any) => {
                const itemPackageId = typeof item.packageId === 'string' ? item.packageId : item.packageId?.toString();
                return itemPackageId === targetPackageId;
              });
            }
          } catch (error) {
            console.error('Error fetching menu items:', error);
          }
        }

        if (filteredItems.length === 0) {
          toast({
            title: "Error",
            description: "No menu items found for the selected package. Please try again.",
            variant: "destructive",
          });
          return;
        }

        const selectedItemsWithDetails = filteredItems.map((item: any) => {
          const quantity = (item.quantity !== undefined && item.quantity !== null) ? item.quantity : 1;
          return {
            id: item.id || item._id?.toString(),
            name: item.name,
            price: item.price || 0,
            additionalPrice: item.additionalPrice || 0,
            isPackageItem: true,
            quantity,
          };
        });

        packageData = {
          selectedItems: selectedItemsWithDetails,
          customItems: [],
          totalPackageItems: filteredItems.length,
          excludedItemCount: 0,
          totalDeduction: 0,
          packageId,
          customPackagePrice: menuPackage?.price || 0,
        };
      }

      const menuPackage = menuPackages.find(pkg => pkg.id === packageId);
      const fallbackPrice = menuPackage?.price || 0;
      const currentPrice = packageData?.customPackagePrice;
      const sanitizedPrice = typeof currentPrice === 'number' && Number.isFinite(currentPrice)
        ? currentPrice
        : typeof currentPrice === 'string'
          ? parseFloat(currentPrice)
          : NaN;

      preparedCustomMenuItems[packageId] = {
        ...packageData,
        selectedItems: sanitizeArrayField(packageData.selectedItems),
        customItems: sanitizeArrayField(packageData.customItems),
        packageId,
        customPackagePrice: Number.isFinite(sanitizedPrice) && sanitizedPrice >= 0
          ? sanitizedPrice
          : fallbackPrice,
      };
    }

    setCustomMenuItems(preparedCustomMenuItems);
    onSave(selectedPackages, preparedCustomMenuItems);
    onOpenChange(false);
    toast({
      title: "Success",
      description: `Saved ${selectedPackages.length} menu package${selectedPackages.length > 1 ? "s" : ""} successfully`,
    });
  };


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Utensils className="w-5 h-5" />
              Select Menu Packages
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Select menu packages and customize items for this quotation.
            </p>
          </DialogHeader>

          {/* Package Selection and Customization */}
          <div className="space-y-6">
            {/* Available Packages */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Available Packages</h3>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Loading menu packages...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {menuPackages.map((menuPackage) => {
                    const isSelected = selectedPackages.includes(menuPackage.id!);
                    const packageCustomData = customMenuItems[menuPackage.id!];
                    const packageItemsCount = packageCustomData?.selectedItems?.filter((item: any) => item.isPackageItem).length || 0;
                    const additionalItemsCount = packageCustomData?.selectedItems?.filter((item: any) => !item.isPackageItem).length || 0;
                    const basePackageItemsCount = packageItems.filter((item: any) => {
                      const itemPackageId = typeof item.packageId === 'string' ? item.packageId : item.packageId?.toString();
                      return itemPackageId === menuPackage.id;
                    }).length;

                    return (
                      <Card
                        key={menuPackage.id}
                        className={`transition-all duration-200 hover:shadow-md ${
                          isSelected
                            ? 'ring-2 ring-blue-500 bg-blue-50'
                            : 'hover:border-blue-300'
                        }`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-lg">{menuPackage.name}</CardTitle>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${menuPackage.type === 'veg' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                  <span className={`inline-flex items-center justify-center w-3.5 h-3.5 ${menuPackage.type === 'veg' ? 'border-green-700' : 'border-red-700'} border rounded-sm`}>
                                    <span className={`${menuPackage.type === 'veg' ? 'bg-green-700' : 'bg-red-700'} w-1.5 h-1.5 rounded-full`} />
                                  </span>
                                  {menuPackage.type === 'veg' ? 'Veg' : 'Non-Veg'}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {menuPackage.description}
                              </p>
                            </div>
                            {isSelected && (
                              <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Price:</span>
                                <span className="text-lg font-bold text-green-600">
                                  ₹{menuPackage.price}
                                </span>
                              </div>
                              {!isSelected && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium">Package Items:</span>
                                  <span className="text-sm text-muted-foreground">{basePackageItemsCount} items</span>
                                </div>
                              )}
                            </div>
                            
                            {isSelected && (
                              <>
                                <div className="pt-2 border-t space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                      Custom Package Rate (₹)
                                    </label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={(packageCustomData?.customPackagePrice ?? menuPackage.price ?? 0).toString()}
                                      onChange={(event) => handlePackagePriceChange(menuPackage.id!, event.target.value)}
                                      className="w-full"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-blue-800 font-medium">Selected Package Items:</span>
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                        {packageCustomData ? packageItemsCount : basePackageItemsCount}
                                      </Badge>
                                    </div>
                                    {additionalItemsCount > 0 && (
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-green-800 font-medium">Additional Items:</span>
                                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                                          {additionalItemsCount}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditPackage(menuPackage);
                                    }}
                                    className="w-full"
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    {packageCustomData ? 'Edit Customization' : 'Customize Menu'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePackageSelect(menuPackage.id!);
                                    }}
                                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X className="w-4 h-4 mr-2" />
                                    Deselect Package
                                  </Button>
                                </div>
                              </>
                            )}
                            
                            {!isSelected && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handlePackageSelect(menuPackage.id!)}
                                className="w-full"
                              >
                                Select Package
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>


          {/* Navigation */}
          <div className="flex justify-end items-center pt-4 border-t gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={selectedPackages.length === 0}
            >
              Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Menu Item Editor Dialog */}
      {editingPackage && (
        <MenuItemEditor
          open={showMenuItemEditor}
          onOpenChange={setShowMenuItemEditor}
          menuPackage={editingPackage}
          onSave={handleMenuItemsSave}
          previouslySelectedItems={customMenuItems[editingPackage.id!]?.selectedItems?.map((item: any) => item.id) || []}
        />
      )}
    </>
  );
}

