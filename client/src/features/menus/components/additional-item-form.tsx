import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertAdditionalItemSchema } from "@shared/schema-client";
import { z } from "zod";
import type { AdditionalItem } from "@shared/schema-client";

const formSchema = insertAdditionalItemSchema;

interface AdditionalItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem?: AdditionalItem | null;
}

export default function AdditionalItemForm({ open, onOpenChange, editingItem }: AdditionalItemFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [quantityInput, setQuantityInput] = useState<string>("");
  const [priceInput, setPriceInput] = useState<string>("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      quantity: undefined,
      price: undefined,
      isVeg: true,
    },
  });

  // Reset form when editingItem changes
  useEffect(() => {
    if (editingItem) {
      form.reset({
        name: editingItem.name,
        description: editingItem.description || "",
        quantity: editingItem.quantity,
        price: editingItem.price,
        isVeg: editingItem.isVeg !== undefined ? editingItem.isVeg : true,
      });
      setQuantityInput(editingItem.quantity !== undefined && editingItem.quantity !== null ? editingItem.quantity.toString() : "");
      setPriceInput(editingItem.price !== undefined && editingItem.price !== null ? editingItem.price.toString() : "");
    } else {
      form.reset({
        name: "",
        description: "",
        quantity: undefined,
        price: undefined,
        isVeg: true,
      });
      setQuantityInput("");
      setPriceInput("");
    }
  }, [editingItem, form]);

  const createItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/menus/additional-items", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create additional item");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menus/additional-items"] });
      toast({ title: "Success", description: "Additional item created successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create additional item", 
        variant: "destructive" 
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("PATCH", `/api/menus/additional-items/${editingItem!.id}`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update additional item");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menus/additional-items"] });
      toast({ title: "Success", description: "Additional item updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update additional item", 
        variant: "destructive" 
      });
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    // Validate that price is greater than 0
    if (data.price === undefined || data.price === null || data.price <= 0) {
      toast({
        title: "Validation Error",
        description: "Price per person must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateItemMutation.mutateAsync(data);
      } else {
        await createItemMutation.mutateAsync(data);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "Edit Additional Item" : "Create Additional Item"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Package Item Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Package Item Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Soup, Floating Starters, Welcome Drinks" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quantity */}
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Optional" 
                        min="1"
                        value={quantityInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setQuantityInput(value);
                          if (value === "" || value === null || value === undefined) {
                            field.onChange(undefined);
                          } else {
                            const num = parseFloat(value);
                            if (!isNaN(num) && num > 0) {
                              field.onChange(num);
                            }
                            // If num is 0, negative, or NaN, don't update the field value
                            // but allow the input to show what user is typing
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === "" || value === "0" || value === null || value === undefined) {
                            setQuantityInput("");
                            field.onChange(undefined);
                          } else {
                            const num = parseFloat(value);
                            if (!isNaN(num) && num > 0) {
                              setQuantityInput(num.toString());
                              field.onChange(num);
                            } else {
                              setQuantityInput("");
                              field.onChange(undefined);
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Price */}
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Person (₹) *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Enter price per person" 
                        min="1"
                        value={priceInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPriceInput(value);
                          if (value === "" || value === null || value === undefined) {
                            field.onChange(undefined);
                          } else {
                            const num = parseFloat(value);
                            if (!isNaN(num) && num > 0) {
                              field.onChange(num);
                            }
                            // If num is 0, negative, or NaN, don't update the field value
                            // but allow the input to show what user is typing
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === "" || value === "0" || value === null || value === undefined) {
                            setPriceInput("");
                            field.onChange(undefined);
                          } else {
                            const num = parseFloat(value);
                            if (!isNaN(num) && num > 0) {
                              setPriceInput(num.toString());
                              field.onChange(num);
                            } else {
                              setPriceInput("");
                              field.onChange(undefined);
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* Veg/Non-Veg */}
            <FormField
              control={form.control}
              name="isVeg"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Vegetarian Item
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Check if this is a vegetarian item
                      </p>
                    </div>
                  </FormItem>
                )}
              />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Optional description of the additional item..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingItem ? "Update Item" : "Create Item"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

